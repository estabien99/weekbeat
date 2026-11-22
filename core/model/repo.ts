import type { WeekbeatDB } from './db.ts';
import type { Availability, Household, Id, Lang, Level, Profile, TimeWindow, WeeklyGoal } from './types.ts';

/**
 * Household, profile and availability operations. All writes go through here so that
 * invariants (household membership, valid windows) hold no matter which UI calls them.
 */

export interface NewProfile {
  name: string;
  lang: Lang;
  level: Level;
  goal: WeeklyGoal;
  /** Usual session length in minutes; optional (the planner asks for it when it needs one). */
  sessionMin?: number;
}

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateWindow(w: TimeWindow): void {
  if (!Number.isInteger(w.day) || w.day < 1 || w.day > 7) throw new ValidationError('day', 'Day must be 1–7');
  if (!TIME.test(w.from) || !TIME.test(w.to)) throw new ValidationError('time', 'Times must be HH:mm');
  if (w.from >= w.to) throw new ValidationError('time', 'A window must end after it starts');
}

/** Sorted by day and start; overlapping or touching windows on the same day are merged. */
export function normalizeWindows(windows: TimeWindow[]): TimeWindow[] {
  windows.forEach(validateWindow);
  const sorted = [...windows].sort((a, b) => a.day - b.day || a.from.localeCompare(b.from));
  const out: TimeWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && last.day === w.day && w.from <= last.to) {
      if (w.to > last.to) last.to = w.to;
    } else {
      out.push({ ...w });
    }
  }
  return out;
}

function validateProfile(p: NewProfile): void {
  if (!p.name.trim()) throw new ValidationError('name', 'Name is required');
  if (!Number.isInteger(p.goal.target) || p.goal.target < 1) {
    throw new ValidationError('goal', 'Weekly goal must be a positive whole number');
  }
  if (p.sessionMin !== undefined && (!Number.isInteger(p.sessionMin) || p.sessionMin < 1)) {
    throw new ValidationError('sessionMin', 'Session length must be a positive whole number of minutes');
  }
}

const newId = (): Id => crypto.randomUUID();

/** The app supports one household per device in v0.x. */
export async function getHousehold(db: WeekbeatDB): Promise<Household | undefined> {
  return db.households.toCollection().first();
}

export async function createHousehold(
  db: WeekbeatDB,
  name: string,
  first: NewProfile,
): Promise<{ household: Household; profile: Profile }> {
  if (!name.trim()) throw new ValidationError('household', 'Household name is required');
  validateProfile(first);
  return db.transaction('rw', db.households, db.profiles, db.availability, async () => {
    if (await getHousehold(db)) throw new ValidationError('household', 'A household already exists');
    const householdId = newId();
    const profile = buildProfile(householdId, first);
    const household: Household = {
      id: householdId,
      name: name.trim(),
      memberIds: [profile.id],
      sharedGoals: [],
      gameMode: 'solo',
    };
    await db.households.add(household);
    await db.profiles.add(profile);
    await db.availability.add({ id: newId(), profileId: profile.id, windows: [], busy: [] });
    return { household, profile };
  });
}

function buildProfile(householdId: Id, p: NewProfile): Profile {
  return {
    id: newId(),
    householdId,
    name: p.name.trim(),
    lang: p.lang,
    level: p.level,
    goals: [p.goal],
    hobbies: [],
    limitations: [],
    game: { enabled: true },
    ...(p.sessionMin !== undefined ? { preferredSessionMin: p.sessionMin } : {}),
  };
}

export async function addProfile(db: WeekbeatDB, p: NewProfile): Promise<Profile> {
  validateProfile(p);
  return db.transaction('rw', db.households, db.profiles, db.availability, async () => {
    const household = await getHousehold(db);
    if (!household) throw new ValidationError('household', 'Create the household first');
    const profile = buildProfile(household.id, p);
    await db.profiles.add(profile);
    await db.households.update(household.id, { memberIds: [...household.memberIds, profile.id] });
    await db.availability.add({ id: newId(), profileId: profile.id, windows: [], busy: [] });
    return profile;
  });
}

export async function updateProfile(db: WeekbeatDB, id: Id, p: NewProfile): Promise<void> {
  validateProfile(p);
  const existing = await db.profiles.get(id);
  if (!existing) throw new ValidationError('profile', 'Unknown profile');
  const goals = [p.goal, ...existing.goals.slice(1)];
  // An empty length field clears the setting (Dexie removes properties updated to undefined).
  await db.profiles.update(id, {
    name: p.name.trim(),
    lang: p.lang,
    level: p.level,
    goals,
    preferredSessionMin: p.sessionMin,
  });
}

export async function getAvailability(db: WeekbeatDB, profileId: Id): Promise<Availability | undefined> {
  return db.availability.where('profileId').equals(profileId).first();
}

export async function setWindows(db: WeekbeatDB, profileId: Id, windows: TimeWindow[]): Promise<TimeWindow[]> {
  const normalized = normalizeWindows(windows);
  await db.transaction('rw', db.availability, async () => {
    const existing = await getAvailability(db, profileId);
    if (existing) await db.availability.update(existing.id, { windows: normalized });
    else await db.availability.add({ id: newId(), profileId, windows: normalized, busy: [] });
  });
  return normalized;
}
