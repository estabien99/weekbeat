import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import {
  GAME_TUNING,
  gameState,
  householdGame,
  type Badge,
  type GameState,
  type IsoDate,
  type Lang,
  type Profile,
  type QuestProgress,
  type WeeklyGoal,
} from '../../core/index.ts';
import { activityCatalogue, knowledgeRules } from '../../knowledge/index.ts';
import { db } from '../db.ts';
import { localeOf } from '../format.ts';

/**
 * Game card (issue #7): this week's goal, weeks in a row, level, this month's quests and badges, all derived
 * from logs. Shown only when the game is on. No loss wording: a missed week is never mentioned, paused weeks
 * just rest, quests simply end with the month.
 */
export function GameCard({ profile, today }: { profile: Profile; today: IsoDate }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const data = useLiveQuery(async () => {
    const [household, people, logs, planned] = await Promise.all([
      db.households.get(profile.householdId),
      db.profiles.where('householdId').equals(profile.householdId).toArray(),
      db.loggedActivities.toArray(),
      db.plannedSessions.toArray(),
    ]);
    return { gameMode: household?.gameMode, people, logs, planned };
  }, [profile.householdId]);
  if (!data) return null;

  const stateOf = (p: Profile): GameState | null =>
    gameState({
      profile: p,
      gameMode: data.gameMode,
      logs: data.logs,
      planned: data.planned,
      catalogue: activityCatalogue,
      rules: knowledgeRules,
      today,
    });
  const state = stateOf(profile);
  if (!state) return null;
  const week = state.weeks.at(-1)!;
  const others = data.people.filter((p) => p.id !== profile.id);
  const household = householdGame(
    [profile, ...others].map((p) => ({ profileId: p.id, state: p.id === profile.id ? state : stateOf(p) })),
    data.gameMode,
  );

  const goalLabel = (g: WeeklyGoal) => {
    const base = t(g.kind === 'sessions' ? 'game.goalSessions' : 'game.goalMinutes');
    const cats = g.categories?.map((c) => t(`activityCategories.${c}`, { defaultValue: c })).join(', ');
    return cats ? `${base} (${cats})` : base;
  };
  const badgeLabel = (b: Badge) => {
    const [base = '', arg] = b.key.split(':');
    if (base === 'first-category') return t('game.badges.first-category', { category: t(`activityCategories.${arg}`) });
    if (base === 'variety-week') return t('game.badges.variety-week', { count: GAME_TUNING.badgeVarietyWeek });
    return t(`game.badges.${base}`, { count: Number(arg) });
  };
  const questLabel = (q: QuestProgress) =>
    t(`game.quests.${q.key === 'complement' ? `complement-${q.need}` : q.key}`, {
      target: q.target,
      perWeek: q.perWeek,
    });
  const ruleSummary = (q: QuestProgress) =>
    q.key === 'complement' ? knowledgeRules.find((r) => r.id === q.ruleId)?.summary[lang] : undefined;
  const dateFmt = new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' });
  const monthName = new Intl.DateTimeFormat(localeOf(lang), { month: 'long' }).format(new Date(`${today}T12:00`));

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

      {household && household.members > 1 && (
        <p>
          {t('game.household', { met: household.metThisWeek, active: household.activeThisWeek })}
          {household.streak > 0 && ` · ${t('game.householdStreak', { count: household.streak })}`}
        </p>
      )}

      {state.quests.length > 0 && (
        <>
          <h4>{t('game.questsTitle', { month: monthName })}</h4>
          <ul className="quests">
            {state.quests.map((q) => {
              const id = `quest-${q.key}-${q.ruleId ?? ''}`;
              const summary = ruleSummary(q);
              return (
                <li key={id}>
                  <span id={id}>{questLabel(q)}</span>
                  <span className="quest-progress">
                    <progress aria-labelledby={id} value={Math.min(q.progress, q.target)} max={q.target} />
                    <span className={q.done ? 'ok' : 'muted'}>
                      {q.done ? t('game.questDone') : t('game.ofTarget', { done: q.progress, target: q.target })}
                    </span>
                  </span>
                  {summary && <span className="muted small">{summary}</span>}
                </li>
              );
            })}
          </ul>
          <p className="muted small">{t('game.questOptional')}</p>
        </>
      )}

      {state.badges.length > 0 && (
        <>
          <h4>{t('game.badgesTitle')}</h4>
          <ul className="badges">
            {state.badges.map((b) => (
              <li key={b.key}>
                <span className="badge-mark" aria-hidden="true" />
                <span>{badgeLabel(b)}</span> <span className="muted small">{dateFmt.format(new Date(b.earnedAt))}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted small">{t('game.hint')}</p>
    </section>
  );
}
