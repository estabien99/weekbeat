import { useTranslation } from 'react-i18next';
import type { Lang, Place, Weekday } from '../../core/index.ts';
import type { CoachKind } from '../../connectors/freeletics-coach/coach.ts';
import type { CoachDraft } from '../coach.ts';
import { weekdayNames } from '../format.ts';

const KINDS: CoachKind[] = ['bodyweight', 'weighted', 'both'];

/** Interview step: does the person follow a Freeletics Coach plan, and what does it look like. */
export function CoachFields({
  value,
  onChange,
  places,
  idPrefix,
  describedBy,
  invalid,
}: {
  value: CoachDraft;
  onChange: (d: CoachDraft) => void;
  places: Place[];
  idPrefix: string;
  describedBy: string;
  invalid?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const days = weekdayNames(lang);
  const set = (p: Partial<CoachDraft>) => onChange({ ...value, ...p });
  const indoor = places.filter((p) => p.kind !== 'outdoor').sort((a, b) => a.name.localeCompare(b.name, lang));
  return (
    <>
      <fieldset className="choices" aria-describedby={describedBy}>
        <legend className="sr-only">{t('coach.use')}</legend>
        {([false, true] as const).map((on) => (
          <label key={String(on)} className="choice">
            <input type="radio" name={`${idPrefix}-use`} checked={value.use === on} onChange={() => set({ use: on })} />
            <span>{t(on ? 'coach.yes' : 'coach.no')}</span>
          </label>
        ))}
      </fieldset>

      {value.use && (
        <>
          <div className="field">
            <label htmlFor={`${idPrefix}-days`}>{t('coach.daysPerWeek')}</label>
            <input
              id={`${idPrefix}-days`}
              type="number"
              inputMode="numeric"
              min={1}
              max={7}
              step={1}
              aria-invalid={invalid === 'daysPerWeek' ? true : undefined}
              value={value.daysPerWeek}
              onChange={(e) => set({ daysPerWeek: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-min`}>{t('coach.durationMin')}</label>
            <input
              id={`${idPrefix}-min`}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              aria-invalid={invalid === 'sessionMin' ? true : undefined}
              value={value.durationMin}
              onChange={(e) => set({ durationMin: e.target.value })}
            />
          </div>

          <fieldset className="choices">
            <legend>{t('coach.kind')}</legend>
            {KINDS.map((k) => (
              <label key={k} className="choice">
                <input
                  type="radio"
                  name={`${idPrefix}-kind`}
                  checked={value.kind === k}
                  onChange={() => set({ kind: k })}
                />
                <span>{t(`coach.kinds.${k}`)}</span>
              </label>
            ))}
          </fieldset>

          {value.kind !== 'bodyweight' && (
            <fieldset
              className="choices"
              aria-describedby={`${idPrefix}-where-hint`}
              aria-invalid={invalid === 'programmePlaces' ? true : undefined}
            >
              <legend>{t('coach.where')}</legend>
              <p className="muted small" id={`${idPrefix}-where-hint`}>
                {t(indoor.length > 0 ? 'coach.whereHint' : 'coach.noPlaces')}
              </p>
              {indoor.map((p) => (
                <label key={p.id} className="choice">
                  <input
                    type="checkbox"
                    checked={value.weightPlaceIds.includes(p.id)}
                    onChange={(e) =>
                      set({
                        weightPlaceIds: e.target.checked
                          ? [...value.weightPlaceIds, p.id]
                          : value.weightPlaceIds.filter((x) => x !== p.id),
                      })
                    }
                  />
                  <span>{p.name}</span>
                </label>
              ))}
            </fieldset>
          )}

          <fieldset className="choices" aria-describedby={`${idPrefix}-wd-hint`}>
            <legend>{t('coach.weekdays')}</legend>
            <p className="muted small" id={`${idPrefix}-wd-hint`}>
              {t('coach.weekdaysHint')}
            </p>
            {days.map((name, i) => {
              const day = (i + 1) as Weekday;
              return (
                <label key={day} className="choice">
                  <input
                    type="checkbox"
                    checked={value.weekdays.includes(day)}
                    onChange={(e) =>
                      set({
                        weekdays: e.target.checked ? [...value.weekdays, day] : value.weekdays.filter((d) => d !== day),
                      })
                    }
                  />
                  <span>{name}</span>
                </label>
              );
            })}
          </fieldset>
        </>
      )}
    </>
  );
}
