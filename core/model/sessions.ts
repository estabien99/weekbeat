import type { WeekbeatDB } from './db.ts';
import { checkIn } from './memberships.ts';
import { addLog } from './merge.ts';
import { ValidationError } from './repo.ts';
import type { Id, LoggedActivity, PlannedSession } from './types.ts';

const newId = (): Id => crypto.randomUUID();

/**
 * Planned-session operations behind the week view. The planner only proposes; these run when the person taps.
 */

/** Saves proposals the person accepted. Proposal ids are deterministic, so accepting twice changes nothing. */
export async function acceptSessions(db: WeekbeatDB, sessions: readonly PlannedSession[]): Promise<void> {
  await db.plannedSessions.bulkPut(sessions.map((s) => ({ ...s, status: 'accepted' as const })));
}

export async function setSessionStatus(
  db: WeekbeatDB,
  id: Id,
  status: Extract<PlannedSession['status'], 'done' | 'missed' | 'skipped' | 'accepted'>,
): Promise<void> {
  const n = await db.plannedSessions.update(id, { status });
  if (n === 0 && !(await db.plannedSessions.get(id))) throw new ValidationError('session', 'Unknown session');
}

/**
 * Marks a session done and logs it, so the game and later weeks can count it (game state is derived from logs). A
 * session at a place is logged as a visit (a check-in), so it counts toward check-in limits and the value meter
 * too; other sessions are logged as `manual`. Marking it done twice logs it once.
 */
export async function completeSession(db: WeekbeatDB, id: Id): Promise<void> {
  const s = await db.plannedSessions.get(id);
  if (!s) throw new ValidationError('session', 'Unknown session');
  const logged = await db.loggedActivities.where('plannedSessionId').equals(id).count();
  if (logged > 0) {
    await setSessionStatus(db, id, 'done');
    return;
  }
  if (!s.placeId || !(await db.places.get(s.placeId))) {
    await db.transaction('rw', db.plannedSessions, db.loggedActivities, async () => {
      await db.plannedSessions.update(id, { status: 'done' });
      await addLog(db, {
        id: newId(),
        profileId: s.profileId,
        activityTypeId: s.activityTypeId,
        start: s.start.slice(0, 16),
        durationMin: s.durationMin,
        source: 'manual',
        plannedSessionId: s.id,
      });
    });
    return;
  }
  await checkIn(db, {
    profileId: s.profileId,
    placeId: s.placeId,
    activityTypeId: s.activityTypeId,
    start: s.start.slice(0, 16),
    durationMin: s.durationMin,
    plannedSessionId: s.id,
  });
}

/**
 * Applies the replan offer the person picked: the original session becomes `missed` (it did not happen) or
 * `moved` (it was moved before it was due); a new slot or fallback is saved as accepted. Letting it go keeps a
 * missed session missed and marks a not-yet-due one as skipped.
 */
export async function applyReplan(
  db: WeekbeatDB,
  offer: { replaces: Id; session?: PlannedSession },
  reason: 'missed' | 'moved',
): Promise<void> {
  await db.transaction('rw', db.plannedSessions, async () => {
    const original = await db.plannedSessions.get(offer.replaces);
    if (!original) throw new ValidationError('session', 'Unknown session');
    const status = offer.session ? reason : reason === 'missed' ? 'missed' : 'skipped';
    await db.plannedSessions.update(original.id, { status });
    if (offer.session) await db.plannedSessions.put({ ...offer.session, status: 'accepted' });
  });
}

export interface NewManualLog {
  profileId: Id;
  activityTypeId: Id;
  start: string;
  durationMin: number;
}

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Logs an activity that was not planned and has no place (a walk, a bike ride to work). It is a `manual` log, so it
 * merges with a log of the same session from another source and counts like any other.
 */
export async function logActivity(db: WeekbeatDB, l: NewManualLog): Promise<LoggedActivity> {
  if (!LOCAL_DATE_TIME.test(l.start)) throw new ValidationError('time', 'Start must be YYYY-MM-DDTHH:mm');
  if (!Number.isInteger(l.durationMin) || l.durationMin < 1) {
    throw new ValidationError('sessionMin', 'Duration must be a positive whole number of minutes');
  }
  if (!l.activityTypeId.trim()) throw new ValidationError('activity', 'Choose an activity');
  return db.transaction('rw', db.profiles, db.loggedActivities, async () => {
    if (!(await db.profiles.get(l.profileId))) throw new ValidationError('profile', 'Unknown profile');
    return addLog(db, { id: newId(), source: 'manual', ...l });
  });
}
