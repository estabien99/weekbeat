import type { WeekbeatDB } from './db.ts';
import { ValidationError } from './repo.ts';
import type { Id, PlannedSession } from './types.ts';

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
