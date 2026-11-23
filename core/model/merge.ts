import type { WeekbeatDB } from './db.ts';
import type { Id, LoggedActivity, PlannedSession } from './types.ts';

/**
 * Logs from several sources (check-in, the "done" tap, later Garmin and Health Connect) are merged into one session
 * before they count (concept doc → "Data model"). The session counts through one log, its primary; the others point
 * to it with `mergedIntoId` and are skipped by the planner, check-in limits and the value meter.
 */

function minutes(iso: string): number {
  const [y, mo, d, h, mi] = [0, 5, 8, 11, 14].map((i, k) => Number(iso.slice(i, i + (k === 0 ? 4 : 2))));
  return Date.UTC(y!, mo! - 1, d!, h!, mi!) / 60000;
}

/** Same person, overlapping time, not at two different places and not two different planned sessions. */
export function sameSession(a: LoggedActivity, b: LoggedActivity): boolean {
  if (a.profileId !== b.profileId) return false;
  if (a.placeId && b.placeId && a.placeId !== b.placeId) return false;
  if (a.plannedSessionId && b.plannedSessionId && a.plannedSessionId !== b.plannedSessionId) return false;
  const [as, bs] = [minutes(a.start), minutes(b.start)];
  return as < bs + Math.max(b.durationMin, 1) && bs < as + Math.max(a.durationMin, 1);
}

const byStart = (a: LoggedActivity, b: LoggedActivity) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id);

/** The visit (a log at a place) counts the session, so check-in limits and the value meter see it; else the earliest. */
function primaryOf(group: readonly LoggedActivity[]): LoggedActivity {
  const sorted = [...group].sort(byStart);
  return sorted.find((l) => l.placeId) ?? sorted[0]!;
}

/**
 * Saves a log and merges it with the person's log of the same session, if there is one. Call inside a
 * read-write transaction on `loggedActivities`. Returns the log as saved.
 */
export async function addLog(db: WeekbeatDB, log: LoggedActivity): Promise<LoggedActivity> {
  const own = await db.loggedActivities.where('profileId').equals(log.profileId).toArray();
  const target = own.filter((l) => !l.mergedIntoId && sameSession(l, log)).sort(byStart)[0];
  if (!target) {
    await db.loggedActivities.add(log);
    return log;
  }
  const group = [target, ...own.filter((l) => l.mergedIntoId === target.id), log];
  const primary = primaryOf(group);
  const plannedSessionId = group.find((l) => l.plannedSessionId)?.plannedSessionId;
  for (const l of group) {
    const next: LoggedActivity =
      l.id === primary.id
        ? { ...l, mergedIntoId: undefined, ...(plannedSessionId ? { plannedSessionId } : {}) }
        : { ...l, mergedIntoId: primary.id };
    await db.loggedActivities.put(next);
  }
  return (await db.loggedActivities.get(log.id))!;
}

export interface MergedSession {
  /** The log the session counts through. */
  primary: LoggedActivity;
  /** Every log of the session, the primary first. */
  logs: LoggedActivity[];
  /** Distinct sources, e.g. ["checkin:wellpass", "manual"]. */
  sources: string[];
  /** A visit at a place (a check-in). */
  visit: boolean;
  /** A coach-plan workout (a planned programme session) or a workout recorded by a device or app. */
  workout: boolean;
  /** Visit and workout in one session (e.g. Wellpass check-in + Freeletics workout): the game's combo. */
  combo: boolean;
}

/** Recorded by a device or app (Garmin, Health Connect, …), not a tap in Weekbeat. */
const recorded = (source: string) => source !== 'manual' && !source.startsWith('checkin');

/**
 * Sessions as the game will count them: one per primary log, with its merged logs. Derived, never stored.
 * `planned` tells which logs belong to a programme session (e.g. a Freeletics Coach day).
 */
export function mergedSessions(
  logs: readonly LoggedActivity[],
  planned: readonly PlannedSession[] = [],
): MergedSession[] {
  const programmeSession = new Set(planned.filter((s) => s.programmeId).map((s) => s.id));
  return logs
    .filter((l) => !l.mergedIntoId)
    .sort(byStart)
    .map((primary) => {
      const all = [primary, ...logs.filter((l) => l.mergedIntoId === primary.id).sort(byStart)];
      const visit = all.some((l) => l.placeId);
      const workout = all.some(
        (l) => recorded(l.source) || (l.plannedSessionId !== undefined && programmeSession.has(l.plannedSessionId)),
      );
      return {
        primary,
        logs: all,
        sources: [...new Set(all.map((l) => l.source))],
        visit,
        workout,
        combo: visit && workout,
      };
    });
}

/** The merged session a planned session was logged as, if any. */
export function sessionOfPlanned(sessions: readonly MergedSession[], plannedId: Id): MergedSession | undefined {
  return sessions.find((s) => s.logs.some((l) => l.plannedSessionId === plannedId));
}
