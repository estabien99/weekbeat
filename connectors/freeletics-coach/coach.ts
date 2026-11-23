import type { Id, PlannedSession, Programme, Weekday } from '../../core/index.ts';

/**
 * Freeletics Coach (issue #9). Freeletics has no public API, so Weekbeat steers the Coach instead of reading it:
 * the person enters their Coach plan once, the planner places the Coach days in the week, and the week view says
 * which days and places to set in the Coach. Nothing is sent to Freeletics; nothing is scraped. See README.md for
 * the import paths (Health Connect in 0.4, Garmin in 0.2).
 */
export const COACH_ID = 'freeletics-coach';

/** The proper name, the same in every language (used descriptively, no logo). */
export const COACH_NAME = 'Freeletics Coach';

export type CoachKind = 'bodyweight' | 'weighted' | 'both';

/**
 * Catalogue activities a Coach session counts as. Bodyweight workouts: vigorous calisthenics (Compendium: push-ups,
 * lunges, jumping jacks, burpees); weighted workouts: resistance training with multiple exercises. Kept here so
 * Health Connect and Garmin imports map to the same types later (ActivityType.mapping).
 */
export const COACH_ACTIVITY: Record<Exclude<CoachKind, 'both'>, Id> = {
  bodyweight: 'bodyweight-vigorous',
  weighted: 'weight-training',
};

/** What the person tells Weekbeat about their Coach plan (interview step, Settings). */
export interface CoachAnswers {
  daysPerWeek: number;
  durationMin: number;
  kind: CoachKind;
  /** Where the person has the weights for weighted sessions (their own places). */
  weightPlaceIds: Id[];
  /** Days the Coach is set to now; empty when the person does not know or has not set any. */
  weekdays: Weekday[];
}

/** The programme record for the answers. With "both", weighted and bodyweight sessions take turns. */
export function coachProgramme(profileId: Id, a: CoachAnswers): Omit<Programme, 'id'> {
  const bodyweight = { activityTypeId: COACH_ACTIVITY.bodyweight, durationMin: a.durationMin, equipment: [] };
  const weighted = {
    activityTypeId: COACH_ACTIVITY.weighted,
    durationMin: a.durationMin,
    equipment: [],
    placeIds: [...a.weightPlaceIds].sort(),
  };
  const typicalSessions =
    a.kind === 'bodyweight' ? [bodyweight] : a.kind === 'weighted' ? [weighted] : [weighted, bodyweight];
  return {
    profileId,
    name: COACH_NAME,
    connectorId: COACH_ID,
    daysPerWeek: a.daysPerWeek,
    typicalSessions,
    ...(a.weekdays.length > 0 ? { weekdays: [...new Set(a.weekdays)].sort((x, y) => x - y) } : {}),
  };
}

/** The answers a saved programme stands for (to edit them again). */
export function answersOf(p: Programme): CoachAnswers {
  const ids = new Set(p.typicalSessions.map((t) => t.activityTypeId));
  const hasWeights = ids.has(COACH_ACTIVITY.weighted);
  const hasBodyweight = ids.has(COACH_ACTIVITY.bodyweight);
  return {
    daysPerWeek: p.daysPerWeek,
    durationMin: p.typicalSessions[0]?.durationMin ?? 0,
    kind: hasWeights && hasBodyweight ? 'both' : hasWeights ? 'weighted' : 'bodyweight',
    weightPlaceIds: p.typicalSessions.flatMap((t) => t.placeIds ?? []),
    weekdays: p.weekdays ?? [],
  };
}

const PLANNED: ReadonlySet<string> = new Set(['proposed', 'accepted', 'done']);

export interface CoachChecklist {
  /** Training days to set in the Coach this week (ISO weekdays, sorted). */
  days: Weekday[];
  /** The days differ from the ones the Coach is set to now (unknown current days count as a change). */
  change: boolean;
  /** Where each Coach session happens: a place (its Workout Space), or none in particular. */
  sessions: { day: Weekday; activityTypeId: Id; placeId?: Id; durationMin: number }[];
}

/**
 * What to set in the Coach for a week, from the week's planned Coach sessions (proposed, accepted or done).
 * Undefined when the week has none. Pure: the app shows it, the person changes the Coach by hand.
 */
export function coachChecklist(p: Programme, week: readonly PlannedSession[]): CoachChecklist | undefined {
  const own = week
    .filter((s) => s.programmeId === p.id && PLANNED.has(s.status))
    .sort((a, b) => a.start.localeCompare(b.start));
  if (own.length === 0) return undefined;
  const sessions = own.map((s) => ({
    day: isoWeekdayOf(s.start),
    activityTypeId: s.activityTypeId,
    ...(s.placeId ? { placeId: s.placeId } : {}),
    durationMin: s.durationMin,
  }));
  const days = [...new Set(sessions.map((s) => s.day))].sort((a, b) => a - b);
  const now = p.weekdays ?? [];
  const change = days.length !== now.length || days.some((d, i) => d !== now[i]);
  return { days, change, sessions };
}

function isoWeekdayOf(iso: string): Weekday {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const day = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}
