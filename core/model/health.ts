import { toIsoDate } from '../week.ts';
import type { WeekbeatDB } from './db.ts';
import { ValidationError } from './repo.ts';
import type { Id, IsoDate, Profile } from './types.ts';

/**
 * Pause mode, the health self-check and planned rest days (issue #4). The pure functions return the profile
 * fields to change; the async ones write them. Every pause is also kept in `pauses`, so the game keeps past
 * pause weeks frozen after the pause has ended.
 */

type Pauses = { from: IsoDate; to: IsoDate }[];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const addDays = (d: IsoDate, n: number): IsoDate => {
  const x = new Date(`${d}T12:00`);
  return toIsoDate(new Date(x.getFullYear(), x.getMonth(), x.getDate() + n));
};

/** The plan rests for health reasons: the self-check had a yes and no doctor's OK is recorded yet. */
export function healthHold(profile: Profile): boolean {
  return !!profile.health?.flagged && !profile.health.clearedOn;
}

/** Whether the person is paused today or later (pause mode or a health hold). */
export function isPaused(profile: Profile, today: IsoDate): boolean {
  return healthHold(profile) || (!!profile.pausedUntil && profile.pausedUntil >= today);
}

/** Index in `pauses` of the pause that runs today (the one ending on `pausedUntil`), or -1. */
function currentPause(profile: Profile, today: IsoDate): number {
  const until = profile.pausedUntil;
  if (!until || until < today) return -1;
  return (profile.pauses ?? []).findLastIndex((p) => p.to === until && p.from <= today);
}

/** Ends a period on the day before `today`; a period that would end before it starts is dropped. */
function closeBefore(pauses: Pauses, from: IsoDate, today: IsoDate): Pauses {
  const to = addDays(today, -1);
  return to >= from ? [...pauses, { from, to }] : pauses;
}

/** Starts the pause, or moves the end of the running one, to `until` (inclusive). */
export function pauseUntil(profile: Profile, today: IsoDate, until: IsoDate): Pick<Profile, 'pausedUntil' | 'pauses'> {
  if (!ISO.test(until) || until < today) throw new ValidationError('pausedUntil', 'The pause ends today or later');
  const pauses = [...(profile.pauses ?? [])];
  const i = currentPause(profile, today);
  if (i >= 0) pauses[i] = { from: pauses[i]!.from, to: until };
  else pauses.push({ from: today, to: until });
  return { pausedUntil: until, pauses };
}

/** Ends the running pause today: it is kept up to yesterday, and training counts again from today. */
export function pauseEnded(profile: Profile, today: IsoDate): Pick<Profile, 'pausedUntil' | 'pauses'> {
  const pauses = [...(profile.pauses ?? [])];
  const i = currentPause(profile, today);
  if (i < 0) return { pausedUntil: undefined, pauses };
  const [running] = pauses.splice(i, 1);
  return { pausedUntil: undefined, pauses: closeBefore(pauses, running!.from, today) };
}

/** Closes an open health hold: the days from the check up to yesterday stay paused. */
function holdClosed(profile: Profile, today: IsoDate): Pauses {
  const pauses = profile.pauses ?? [];
  return healthHold(profile) ? closeBefore(pauses, profile.health!.checkedOn, today) : [...pauses];
}

/** Records a new self-check result (only the outcome, never the answers). */
export function healthChecked(profile: Profile, today: IsoDate, flagged: boolean): Pick<Profile, 'health' | 'pauses'> {
  return { health: { checkedOn: today, flagged }, pauses: holdClosed(profile, today) };
}

/** The person confirms that a doctor said they may train: the plan and the game go on from today. */
export function healthCleared(profile: Profile, today: IsoDate): Pick<Profile, 'health' | 'pauses'> {
  if (!profile.health) throw new ValidationError('health', 'No self-check yet');
  return { health: { ...profile.health, clearedOn: today }, pauses: holdClosed(profile, today) };
}

/** Adds or removes a planned rest day. */
export function restDayToggled(profile: Profile, date: IsoDate): Pick<Profile, 'restDays'> {
  if (!ISO.test(date)) throw new ValidationError('restDays', 'Expected YYYY-MM-DD');
  const days = new Set(profile.restDays ?? []);
  if (days.has(date)) days.delete(date);
  else days.add(date);
  return { restDays: [...days].sort() };
}

async function patch(db: WeekbeatDB, id: Id, f: (p: Profile) => Partial<Profile>): Promise<void> {
  await db.transaction('rw', db.profiles, async () => {
    const profile = await db.profiles.get(id);
    if (!profile) throw new ValidationError('profile', 'Unknown profile');
    await db.profiles.update(id, f(profile));
  });
}

export const setPause = (db: WeekbeatDB, id: Id, today: IsoDate, until: IsoDate) =>
  patch(db, id, (p) => pauseUntil(p, today, until));
export const endPause = (db: WeekbeatDB, id: Id, today: IsoDate) => patch(db, id, (p) => pauseEnded(p, today));
export const saveHealthCheck = (db: WeekbeatDB, id: Id, today: IsoDate, flagged: boolean) =>
  patch(db, id, (p) => healthChecked(p, today, flagged));
export const clearHealthHold = (db: WeekbeatDB, id: Id, today: IsoDate) =>
  patch(db, id, (p) => healthCleared(p, today));
export const toggleRestDay = (db: WeekbeatDB, id: Id, date: IsoDate) => patch(db, id, (p) => restDayToggled(p, date));
