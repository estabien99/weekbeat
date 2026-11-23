import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { toIsoDate, type IsoDate, type Lang, type PlannedSession, type Profile } from '../../core/index.ts';
import { activityCatalogue } from '../../knowledge/index.ts';
import { db } from '../db.ts';
import { localeOf } from '../format.ts';

const HIDDEN = new Set(['proposed', 'moved', 'skipped']);

/**
 * Read-only: everyone's saved sessions of the week, day by day, with shared sessions marked. Changing a session
 * stays in each person's own week view.
 */
export function HouseholdWeek({ profile, days, today }: { profile: Profile; days: readonly Date[]; today: IsoDate }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const from = toIsoDate(days[0]!);
  const to = toIsoDate(new Date(days[6]!.getFullYear(), days[6]!.getMonth(), days[6]!.getDate() + 1));
  const data = useLiveQuery(async () => {
    const people = await db.profiles.where('householdId').equals(profile.householdId).toArray();
    const sessions = (await db.plannedSessions.where('start').between(from, to).toArray()).filter(
      (s) => !HIDDEN.has(s.status) && people.some((p) => p.id === s.profileId),
    );
    return { people, sessions };
  }, [profile.householdId, from, to]);
  if (!data) return null;
  const dayFmt = new Intl.DateTimeFormat(localeOf(lang), { weekday: 'long' });
  const dateFmt = new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'short' });
  const nameOf = (id: string) => data.people.find((p) => p.id === id)?.name ?? '';
  const activityName = (id: string) => activityCatalogue.find((a) => a.id === id)?.name[lang] ?? id;
  const together = (s: PlannedSession) =>
    s.withProfileIds && s.withProfileIds.length > 0
      ? t('household.together', { names: s.withProfileIds.map(nameOf).filter(Boolean).join(', ') })
      : '';

  return (
    <ol className="week household" aria-label={t('household.title')}>
      {days.map((d) => {
        const iso = toIsoDate(d);
        const list = data.sessions
          .filter((s) => s.start.startsWith(iso))
          .sort((a, b) => a.start.localeCompare(b.start));
        return (
          <li
            key={iso}
            className={iso === today ? 'day today' : 'day'}
            aria-current={iso === today ? 'date' : undefined}
          >
            <div className="day-head">
              <span className="day-name">{dayFmt.format(d)}</span>
              <span className="muted">{dateFmt.format(d)}</span>
            </div>
            {list.length === 0 ? (
              <p className="muted empty">{t('household.empty')}</p>
            ) : (
              <ul className="sessions" aria-label={t('plan.sessions')}>
                {list.map((s) => (
                  <li key={s.id} className={`session ${s.status}`}>
                    <p className="session-title">
                      <strong>{nameOf(s.profileId)}</strong> · {activityName(s.activityTypeId)}{' '}
                      <span className="muted">{s.start.slice(11, 16)}</span>
                    </p>
                    {together(s) && <p className="why">{together(s)}</p>}
                    {s.status === 'done' && <p className="ok">{t('plan.statusDone')}</p>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
