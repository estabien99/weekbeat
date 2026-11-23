import type { WeekbeatDB } from './db.ts';
import { ValidationError } from './repo.ts';
import type { Id, Programme } from './types.ts';

/**
 * Programme operations (an external plan such as the Freeletics Coach). Connectors build the record; these check
 * it and keep one programme per person and connector.
 */

export function validateProgramme(p: Omit<Programme, 'id'>): void {
  if (!Number.isInteger(p.daysPerWeek) || p.daysPerWeek < 1 || p.daysPerWeek > 7) {
    throw new ValidationError('daysPerWeek', 'Days per week must be a whole number from 1 to 7');
  }
  if (p.typicalSessions.length === 0) throw new ValidationError('programmeKind', 'Choose a kind of session');
  for (const t of p.typicalSessions) {
    if (!Number.isInteger(t.durationMin) || t.durationMin < 1) {
      throw new ValidationError('sessionMin', 'Duration must be a positive whole number of minutes');
    }
    if (t.placeIds && t.placeIds.length === 0) throw new ValidationError('programmePlaces', 'Choose a place');
  }
  if (p.weekdays?.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
    throw new ValidationError('day', 'Day must be 1–7');
  }
}

/** The person's programme from this connector, if any. */
export async function programmeOf(db: WeekbeatDB, profileId: Id, connectorId: string): Promise<Programme | undefined> {
  const all = await db.programmes.where('profileId').equals(profileId).toArray();
  return all.find((p) => p.connectorId === connectorId);
}

/** Adds or replaces the person's programme from `p.connectorId`; returns its id. */
export async function saveProgramme(db: WeekbeatDB, p: Omit<Programme, 'id'>): Promise<Id> {
  validateProgramme(p);
  return db.transaction('rw', db.profiles, db.places, db.programmes, async () => {
    if (!(await db.profiles.get(p.profileId))) throw new ValidationError('profile', 'Unknown profile');
    const placeIds = p.typicalSessions.flatMap((t) => t.placeIds ?? []);
    for (const id of new Set(placeIds)) {
      if (!(await db.places.get(id))) throw new ValidationError('programmePlaces', 'Unknown place');
    }
    const existing = p.connectorId ? await programmeOf(db, p.profileId, p.connectorId) : undefined;
    const id = existing?.id ?? crypto.randomUUID();
    const weekdays = p.weekdays && [...new Set(p.weekdays)].sort((a, b) => a - b);
    await db.programmes.put({ ...p, id, ...(weekdays?.length ? { weekdays } : { weekdays: undefined }) });
    return id;
  });
}

/** Removes a programme. Sessions planned from it stay as they are (they already happened or are accepted). */
export async function deleteProgramme(db: WeekbeatDB, id: Id): Promise<void> {
  await db.programmes.delete(id);
}
