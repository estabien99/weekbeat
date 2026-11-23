import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { gameState, type IsoDate, type Profile, type WeeklyGoal } from '../../core/index.ts';
import { activityCatalogue, knowledgeRules } from '../../knowledge/index.ts';
import { db } from '../db.ts';

/**
 * Game card (issue #7): this week's goal, weeks in a row and level, derived from the person's logs. Shown only
 * when the game is on. No loss wording: a missed week is never mentioned, paused weeks just rest.
 */
export function GameCard({ profile, today }: { profile: Profile; today: IsoDate }) {
  const { t } = useTranslation();
  const data = useLiveQuery(async () => {
    const [household, logs, planned] = await Promise.all([
      db.households.get(profile.householdId),
      db.loggedActivities.where('profileId').equals(profile.id).toArray(),
      db.plannedSessions.where('profileId').equals(profile.id).toArray(),
    ]);
    return { gameMode: household?.gameMode, logs, planned };
  }, [profile.id, profile.householdId]);
  if (!data) return null;

  const state = gameState({
    profile,
    gameMode: data.gameMode,
    logs: data.logs,
    planned: data.planned,
    catalogue: activityCatalogue,
    rules: knowledgeRules,
    today,
  });
  if (!state) return null;
  const week = state.weeks.at(-1)!;

  const goalLabel = (g: WeeklyGoal) => {
    const base = t(g.kind === 'sessions' ? 'game.goalSessions' : 'game.goalMinutes');
    const cats = g.categories?.map((c) => t(`activityCategories.${c}`, { defaultValue: c })).join(', ');
    return cats ? `${base} (${cats})` : base;
  };

  return (
    <section className="card game" aria-labelledby="game-title">
      <h3 id="game-title">{t('game.title', { name: profile.name })}</h3>
      {week.status === 'paused' ? (
        <p>{t('game.paused')}</p>
      ) : (
        week.status === 'met' && <p className="ok">{t('game.met')}</p>
      )}
      <dl className="figures">
        {week.status !== 'paused' &&
          week.goals.map((g, i) => (
            <div key={i}>
              <dt>{goalLabel(g.goal)}</dt>
              <dd>{t('game.ofTarget', { done: Math.min(g.done, g.goal.target), target: g.goal.target })}</dd>
            </div>
          ))}
        <div>
          <dt>{t('game.streak')}</dt>
          <dd>{state.streak}</dd>
        </div>
        <div>
          <dt>{t('game.level')}</dt>
          <dd>{state.level}</dd>
        </div>
      </dl>
      <p className="muted small">
        {t('game.xp', { xp: state.xp, left: state.nextLevelXp - state.xp, next: state.level + 1 })}
        {state.bestStreak > state.streak && ` · ${t('game.best', { count: state.bestStreak })}`}
      </p>
      <p className="muted small">{t('game.hint')}</p>
    </section>
  );
}
