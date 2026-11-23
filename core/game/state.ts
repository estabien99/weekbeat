import { intensityOf, intensityThresholds, matchesSuggestion } from '../knowledge.ts';
import { type MergedSession, mergedSessions } from '../model/merge.ts';
import type {
  ActivityType,
  Badge,
  GameMode,
  IsoDate,
  KnowledgeRule,
  LoggedActivity,
  PlannedSession,
  Profile,
  WeeklyGoal,
  XPEvent,
} from '../model/types.ts';
import { toIsoDate, weekOf } from '../week.ts';
import { type QuestProgress, badgesOf, questsOf } from './extras.ts';
import { levelOf, xpForLevel } from './level.ts';
import { type BonusReason, GAME_TUNING } from './tuning.ts';

export interface GameInput {
  profile: Profile;
  /** The household's game mode; 'off' switches the game off for everyone. */
  gameMode?: GameMode;
  /** All logs (any person, any week); the game picks this person's. */
  logs: readonly LoggedActivity[];
  /** Planned sessions: tell coach-plan workouts (combo) and shared sessions (together). */
  planned: readonly PlannedSession[];
  catalogue: readonly ActivityType[];
  rules: KnowledgeRule[];
  /** Today, local date: the week that contains it is still running. */
  today: IsoDate;
}

export interface GoalProgress {
  goal: WeeklyGoal;
  /** Sessions or minutes that count, up to the weekly maximum. */
  done: number;
  reached: boolean;
}

/**
 * met: every goal reached. paused: not met and the week has paused days (neither counts nor breaks the streak).
 * open: the running week. missed: an ended week without the goal (the streak restarts, nothing else happens).
 */
export type WeekStatus = 'met' | 'paused' | 'open' | 'missed';

export interface GameWeek {
  /** Monday, YYYY-MM-DD. */
  weekStart: IsoDate;
  status: WeekStatus;
  goals: GoalProgress[];
  /** Sessions that count toward the goal and earn XP (paused days and sessions beyond the maximum don't). */
  counted: MergedSession[];
  xp: number;
}

export interface GameState {
  /** Oldest first, up to the week that contains `today`. */
  weeks: GameWeek[];
  /** Weeks in a row with the goal met; paused and running weeks are skipped. */
  streak: number;
  /** Longest streak so far; kept for good. */
  bestStreak: number;
  xp: number;
  /** Starts at 1, never goes down. */
  level: number;
  /** Total XP at which the next level starts. */
  nextLevelXp: number;
  events: XPEvent[];
  /** Firsts and milestones, oldest first; never taken away. */
  badges: Badge[];
  /** This month's quests. */
  quests: QuestProgress[];
}

const day = (iso: string): IsoDate => iso.slice(0, 10);
const mondayOf = (d: IsoDate): IsoDate => toIsoDate(weekOf(new Date(`${d}T12:00`))[0]!);
const addDays = (d: IsoDate, n: number): IsoDate => {
  const x = new Date(`${d}T12:00`);
  return toIsoDate(new Date(x.getFullYear(), x.getMonth(), x.getDate() + n));
};

/** Pause periods (inclusive dates): recorded pauses plus the current one up to `pausedUntil`. */
function pausePeriods(profile: Profile, today: IsoDate): { from: IsoDate; to: IsoDate }[] {
  const periods = [...(profile.pauses ?? [])];
  if (profile.pausedUntil && profile.pausedUntil >= today) periods.push({ from: today, to: profile.pausedUntil });
  return periods;
}

/** Whether the game is on for this person: their own switch and the household's mode. */
export function gameEnabled(profile: Profile, gameMode?: GameMode): boolean {
  return profile.game.enabled && gameMode !== 'off';
}

/**
 * The person's game state, derived from their logs; nothing of it is stored or edited. Returns null when the
 * game is off. Same inputs, same state.
 */
export function gameState(input: GameInput): GameState | null {
  const { profile, today } = input;
  if (!gameEnabled(profile, input.gameMode)) return null;

  const activities = new Map(input.catalogue.map((a) => [a.id, a]));
  const thresholds = intensityThresholds(input.rules);
  const plannedById = new Map(input.planned.map((s) => [s.id, s]));
  const pauses = pausePeriods(profile, today);
  const pausedDay = (d: IsoDate) => pauses.some((p) => p.from <= d && d <= p.to);

  // Complement rules that apply to this person's hobbies, for the complement bonus.
  const complements = input.rules.flatMap((r) =>
    r.part === 'complement' && r.data.forActivityIds.some((id) => profile.hobbies.includes(id)) ? [r.data] : [],
  );

  const sessions = mergedSessions(
    input.logs.filter((l) => l.profileId === profile.id),
    input.planned,
  );
  const byWeek = new Map<IsoDate, MergedSession[]>();
  for (const s of sessions) {
    const w = mondayOf(day(s.primary.start));
    byWeek.set(w, [...(byWeek.get(w) ?? []), s]);
  }

  // Weekly maximum: the person's own game maximum if set, else their sessions goal; minutes goals cap minutes.
  const sessionTargets = profile.goals.filter((g) => g.kind === 'sessions').map((g) => g.target);
  const minuteTargets = profile.goals.filter((g) => g.kind === 'minutes').map((g) => g.target);
  const maxSessions =
    profile.game.weeklyMaxSessions ?? (sessionTargets.length ? Math.max(...sessionTargets) : undefined);
  const maxMinutes = maxSessions === undefined && minuteTargets.length ? Math.max(...minuteTargets) : undefined;

  const minutesOf = (s: MergedSession) => Math.max(...s.logs.map((l) => l.durationMin));
  const activityOf = (s: MergedSession) => activities.get(s.primary.activityTypeId);
  const matchesGoal = (g: WeeklyGoal, s: MergedSession) =>
    !g.categories?.length || g.categories.includes(activityOf(s)?.category ?? '');

  const thisWeek = mondayOf(today);
  const firstWeek = [...byWeek.keys(), ...pauses.map((p) => mondayOf(p.from)), thisWeek].sort()[0]!;

  const weeks: GameWeek[] = [];
  const events: XPEvent[] = [];
  for (let w = firstWeek; w <= thisWeek; w = addDays(w, 7)) {
    const counted: MergedSession[] = [];
    let minutes = 0;
    for (const s of byWeek.get(w) ?? []) {
      if (pausedDay(day(s.primary.start))) continue;
      if (maxSessions !== undefined && counted.length >= maxSessions) break;
      if (maxMinutes !== undefined && minutes >= maxMinutes) break;
      counted.push(s);
      minutes += minutesOf(s);
    }

    let weekXp = 0;
    counted.forEach((s, i) => {
      const activity = activityOf(s);
      const intensity = activity ? intensityOf(activity.met, thresholds) : 'light';
      const at = s.primary.start;
      const add = (reason: 'base' | BonusReason, xp: number) => {
        events.push({
          id: `${s.primary.id}:${reason}`,
          profileId: profile.id,
          loggedActivityId: s.primary.id,
          at,
          xp,
          reason,
        });
        weekXp += xp;
      };
      add('base', Math.round(minutesOf(s) * GAME_TUNING.xpPerMinute[intensity]));
      if (s.combo) add('combo', GAME_TUNING.bonus.combo);
      const together = s.logs.some((l) => {
        const p = l.plannedSessionId ? plannedById.get(l.plannedSessionId) : undefined;
        return (p?.withProfileIds?.length ?? 0) > 0;
      });
      if (together) add('together', GAME_TUNING.bonus.together);
      const earlier = counted.slice(0, i).map((x) => activityOf(x)?.category);
      if (activity && i > 0 && !earlier.includes(activity.category)) add('variety', GAME_TUNING.bonus.variety);
      if (
        activity &&
        complements.some((c) => !c.forActivityIds.includes(activity.id) && matchesSuggestion(activity, c.suggest))
      )
        add('complement', GAME_TUNING.bonus.complement);
    });

    const goals = profile.goals.map((goal) => {
      const matching = counted.filter((s) => matchesGoal(goal, s));
      const done = goal.kind === 'sessions' ? matching.length : matching.reduce((n, s) => n + minutesOf(s), 0);
      return { goal, done, reached: done >= goal.target };
    });
    const hasPause = Array.from({ length: 7 }, (_, i) => addDays(w, i)).some(pausedDay);
    const status: WeekStatus =
      goals.length > 0 && goals.every((g) => g.reached)
        ? 'met'
        : hasPause
          ? 'paused'
          : w === thisWeek
            ? 'open'
            : 'missed';
    weeks.push({ weekStart: w, status, goals, counted, xp: weekXp });
  }

  let streak = 0;
  let bestStreak = 0;
  for (const week of weeks) {
    if (week.status === 'met') bestStreak = Math.max(bestStreak, ++streak);
    else if (week.status === 'missed') streak = 0;
  }

  const xp = events.reduce((n, e) => n + e.xp, 0);
  const level = levelOf(xp);
  const ctx = { profile, weeks, events, activities, rules: input.rules, today };
  return {
    weeks,
    streak,
    bestStreak,
    xp,
    level,
    nextLevelXp: xpForLevel(level + 1),
    events,
    badges: badgesOf(ctx),
    quests: questsOf(ctx),
  };
}
