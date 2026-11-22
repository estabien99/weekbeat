import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Lang, Level, NewProfile } from '../../core/index.ts';

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];

/** Controlled fields for a person; the parent owns the form and submit. */
export function ProfileFields({ value, onChange }: { value: NewProfile; onChange: (v: NewProfile) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-name`}>{t('profile.name')}</label>
        <input
          id={`${id}-name`}
          value={value.name}
          required
          autoComplete="given-name"
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-level`}>{t('profile.level')}</label>
        <select
          id={`${id}-level`}
          value={value.level}
          onChange={(e) => onChange({ ...value, level: e.target.value as Level })}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {t(`profile.levels.${l}`)}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="field">
        <legend>{t('profile.goal')}</legend>
        <div className="row">
          <input
            id={`${id}-target`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
            aria-label={t('profile.goalTarget')}
            value={value.goal.target}
            onChange={(e) => onChange({ ...value, goal: { ...value.goal, target: Number(e.target.value) } })}
          />
          <select
            aria-label={t('profile.goalKind')}
            value={value.goal.kind}
            onChange={(e) =>
              onChange({ ...value, goal: { ...value.goal, kind: e.target.value as 'sessions' | 'minutes' } })
            }
          >
            <option value="sessions">{t('profile.goalKinds.sessions')}</option>
            <option value="minutes">{t('profile.goalKinds.minutes')}</option>
          </select>
          <span className="muted">{t('profile.perWeek')}</span>
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-lang`}>{t('profile.lang')}</label>
        <select
          id={`${id}-lang`}
          value={value.lang}
          onChange={(e) => onChange({ ...value, lang: e.target.value as Lang })}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </div>
    </>
  );
}
