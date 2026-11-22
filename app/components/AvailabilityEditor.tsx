import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ValidationError, normalizeWindows, type TimeWindow, type Weekday } from '../../core/index.ts';
import { weekdayNames } from '../format.ts';

const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** Edits weekly time windows; calls onSave with the normalized list. */
export function AvailabilityEditor({
  initial,
  onSave,
  saveLabel,
}: {
  initial: TimeWindow[];
  onSave: (w: TimeWindow[]) => Promise<void> | void;
  saveLabel: string;
}) {
  const { t, i18n } = useTranslation();
  const names = weekdayNames(i18n.resolvedLanguage);
  const [windows, setWindows] = useState<TimeWindow[]>(initial);
  const [draft, setDraft] = useState<TimeWindow>({ day: 1, from: '18:00', to: '19:30' });
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    try {
      setWindows(normalizeWindows([...windows, draft]));
      setError(null);
    } catch (e) {
      setError(e instanceof ValidationError ? t('availability.invalid') : String(e));
    }
  };

  return (
    <div className="availability">
      {windows.length === 0 ? (
        <p className="muted">{t('availability.none')}</p>
      ) : (
        <ul className="windows">
          {windows.map((w, i) => (
            <li key={`${w.day}-${w.from}`}>
              <span>
                <strong>{names[w.day - 1]}</strong> {w.from}–{w.to}
              </span>
              <button
                type="button"
                className="ghost"
                aria-label={t('availability.remove', { day: names[w.day - 1], from: w.from, to: w.to })}
                onClick={() => setWindows(windows.filter((_, j) => j !== i))}
              >
                {t('common.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <fieldset className="field">
        <legend>{t('availability.add')}</legend>
        <div className="row">
          <select
            aria-label={t('availability.day')}
            value={draft.day}
            onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) as Weekday })}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {names[d - 1]}
              </option>
            ))}
          </select>
          <input
            type="time"
            aria-label={t('availability.from')}
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          />
          <input
            type="time"
            aria-label={t('availability.to')}
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          />
          <button type="button" className="ghost" onClick={add}>
            {t('common.add')}
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </fieldset>
      <button type="button" onClick={() => void onSave(windows)}>
        {saveLabel}
      </button>
    </div>
  );
}
