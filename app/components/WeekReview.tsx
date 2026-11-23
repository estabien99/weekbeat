import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { mergedSessions, toIsoDate, weekOf, type Lang, type Profile } from '../../core/index.ts';
import { activityCatalogue } from '../../knowledge/index.ts';
import { db } from '../db.ts';

/**
 * Sundays: a short look back at the week that ends today. Facts only: what was done, what was planned and not
 * done. No score, no blame; the game card already shows the goal.
 */
export function WeekReview({ profile, now, paused }: { profile: Profile; now: Date; paused: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const days = weekOf(now);
  const from = toIsoDate(days[0]!);
  const to = toIsoDate(new Date(days[6]!.getFullYear(), days[6]!.getMonth(), days[6]!.getDate() + 1));
  const data = useLiveQuery(async () => {
    const [logs, sessions] = await Promise.all([
      db.loggedActivities.where('[profileId+start]').between([profile.id, from], [profile.id, to]).toArray(),
      db.plannedSessions.where('[profileId+start]').between([profile.id, from], [profile.id, to]).toArray(),
    ]);
    return { done: mergedSessions(logs, sessions), sessions };
  }, [profile.id, from, to]);
  if (!data) return null;
  const name = (id: string) => activityCatalogue.find((a) => a.id === id)?.name[lang] ?? id;
  const missed = data.sessions.filter((s) => s.status === 'missed');
  const open = data.sessions.filter((s) => s.status === 'accepted');
  const unplanned = data.done.filter((m) => !m.logs.some((l) => l.plannedSessionId)).length;
  return (
    <section className="card review" aria-labelledby="review-title">
      <h3 id="review-title">{t('review.title')}</h3>
      {paused && <p>{t('review.paused')}</p>}
      <p>{t('review.done', { count: data.done.length })}</p>
      {unplanned > 0 && <p className="muted">{t('review.unplanned', { count: unplanned })}</p>}
      {(missed.length > 0 || open.length > 0) && (
        <p className="muted">
          {t('review.notDone', { list: [...missed, ...open].map((s) => name(s.activityTypeId)).join(', ') })}
        </p>
      )}
      <p className="muted small">{t('review.hint')}</p>
    </section>
  );
}
