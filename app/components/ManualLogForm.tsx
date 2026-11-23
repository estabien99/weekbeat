import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ValidationError, logActivity, toIsoDate, weekOf, type Lang, type Profile } from '../../core/index.ts';
import { activityCatalogue } from '../../knowledge/index.ts';
import { db } from '../db.ts';
import { localeOf } from '../format.ts';
import { optionalNumber } from '../memberships.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Logs something that was not planned and has no place (a walk, a ride to work). Days are this week up to today;
 * a log never lies in the future. Saved on this device only.
 */
export function ManualLogForm({
  profile,
  onDone,
  onCancel,
}: {
  profile: Profile;
  onDone: (text: string) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [now] = useState(() => new Date());
  const today = toIsoDate(now);
  const days = weekOf(now).filter((d) => toIsoDate(d) <= today);
  const dayFmt = new Intl.DateTimeFormat(localeOf(lang), { weekday: 'long', day: 'numeric', month: 'short' });
  const activities = [...activityCatalogue].sort(
    (a, b) =>
      Number(profile.hobbies.includes(b.id)) - Number(profile.hobbies.includes(a.id)) ||
      a.name[lang].localeCompare(b.name[lang], lang),
  );
  const [activity, setActivity] = useState(activities[0]?.id ?? '');
  const [day, setDay] = useState(today);
  const [time, setTime] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const [duration, setDuration] = useState(String(profile.preferredSessionMin ?? ''));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => heading.current?.focus(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const start = `${day}T${time}`;
    if (start > `${today}T${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`) {
      setError(t('errors.future'));
      return;
    }
    try {
      await logActivity(db, {
        profileId: profile.id,
        activityTypeId: activity,
        start,
        durationMin: optionalNumber(duration) ?? Number.NaN,
      });
      onDone(t('manualLog.done'));
    } catch (err) {
      setError(err instanceof ValidationError ? t(`errors.${err.field}`, { defaultValue: err.message }) : String(err));
    }
  };

  return (
    <form className="subcard" onSubmit={(e) => void submit(e)} noValidate aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`} ref={heading} tabIndex={-1}>
        {t('manualLog.title', { name: profile.name })}
      </h4>
      <div className="field">
        <label htmlFor={`${id}-activity`}>{t('manualLog.activity')}</label>
        <select id={`${id}-activity`} value={activity} onChange={(e) => setActivity(e.target.value)}>
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name[lang]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-day`}>{t('manualLog.day')}</label>
        <select id={`${id}-day`} value={day} onChange={(e) => setDay(e.target.value)}>
          {days.map((d) => (
            <option key={toIsoDate(d)} value={toIsoDate(d)}>
              {dayFmt.format(d)}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label className="inline" htmlFor={`${id}-time`}>
          <span>{t('manualLog.time')}</span>
          <input id={`${id}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="inline" htmlFor={`${id}-duration`}>
          <span>{t('manualLog.duration')}</span>
          <input
            id={`${id}-duration`}
            inputMode="numeric"
            autoComplete="off"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </label>
      </div>
      <p className="muted small">{t('manualLog.hint')}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit">{t('manualLog.save')}</button>
        <button type="button" className="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
