import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ValidationError,
  checkIn,
  placeFits,
  toIsoDate,
  type Lang,
  type Place,
  type Profile,
} from '../../core/index.ts';
import { activityCatalogue } from '../../knowledge/index.ts';
import { db } from '../db.ts';
import { optionalNumber } from '../memberships.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The check-in tap: logs a visit to a place now (or earlier today). If the person has a session planned there
 * today, the visit is that session and marks it done. Nothing is sent to the provider.
 */
export function CheckInForm({
  place,
  profile,
  onDone,
  onCancel,
}: {
  place: Place;
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
  const planned = useLiveQuery(
    () =>
      db.plannedSessions
        .where('[profileId+start]')
        .between([profile.id, today], [profile.id, `${today}T99`])
        .filter((s) => s.placeId === place.id && s.status === 'accepted')
        .first(),
    [profile.id, today, place.id],
  );
  const fitting = activityCatalogue
    .filter((a) => placeFits(a, place))
    .sort(
      (a, b) =>
        Number(profile.hobbies.includes(b.id)) - Number(profile.hobbies.includes(a.id)) ||
        a.name[lang].localeCompare(b.name[lang], lang),
    );
  const [activity, setActivity] = useState(fitting[0]?.id ?? '');
  const [time, setTime] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const [duration, setDuration] = useState(String(profile.preferredSessionMin ?? ''));
  const [linkPlanned, setLinkPlanned] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => heading.current?.focus(), []);
  // A session planned here today is the likely visit: start from its activity and length (once, when it loads).
  const [seeded, setSeeded] = useState(false);
  if (planned && !seeded) {
    setSeeded(true);
    setActivity(planned.activityTypeId);
    setDuration(String(planned.durationMin));
  }
  const activityName = (aid: string) => activityCatalogue.find((a) => a.id === aid)?.name[lang] ?? aid;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const minutes = optionalNumber(duration);
    try {
      await checkIn(db, {
        profileId: profile.id,
        placeId: place.id,
        activityTypeId: activity,
        start: `${today}T${time}`,
        durationMin: minutes ?? Number.NaN,
        ...(planned && linkPlanned ? { plannedSessionId: planned.id } : {}),
      });
      onDone(t('checkIn.done', { name: place.name }));
    } catch (err) {
      setError(err instanceof ValidationError ? t(`errors.${err.field}`, { defaultValue: err.message }) : String(err));
    }
  };

  return (
    <form className="subcard" onSubmit={(e) => void submit(e)} noValidate>
      <h4 ref={heading} tabIndex={-1}>
        {t('checkIn.title', { place: place.name, name: profile.name })}
      </h4>
      {planned && (
        <label className="choice">
          <input type="checkbox" checked={linkPlanned} onChange={(e) => setLinkPlanned(e.target.checked)} />
          <span>
            {t('checkIn.planned', {
              activity: activityName(planned.activityTypeId),
              time: planned.start.slice(11, 16),
            })}
          </span>
        </label>
      )}
      <div className="field">
        <label htmlFor={`${id}-activity`}>{t('checkIn.activity')}</label>
        <select id={`${id}-activity`} value={activity} onChange={(e) => setActivity(e.target.value)}>
          {fitting.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name[lang]}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label className="inline" htmlFor={`${id}-time`}>
          <span>{t('checkIn.time')}</span>
          <input id={`${id}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="inline" htmlFor={`${id}-duration`}>
          <span>{t('checkIn.duration')}</span>
          <input
            id={`${id}-duration`}
            inputMode="numeric"
            autoComplete="off"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </label>
      </div>
      <p className="muted small">{t('checkIn.hint')}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit">{t('checkIn.save')}</button>
        <button type="button" className="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
