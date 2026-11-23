import type { WeekbeatDB } from './db.ts';
import { ValidationError, normalizeWindows } from './repo.ts';
import type { ActivityCategory, Id, IsoDateTime, LoggedActivity, Membership, Place, TimeWindow } from './types.ts';

/**
 * Memberships (Wellpass, Urban Sports Club, Wellhub, a single gym, …) and the person's own catalogue of places.
 * Provider-agnostic: a membership is a provider id plus what the person types in; nothing here knows a provider's
 * prices or tiers. Which memberships cover a place is explicit on the place (`Place.membershipIds`); a linked
 * membership such as a Plus 1 covers only the places that list it.
 */

export interface NewMembership {
  provider: string;
  tier?: string;
  ownerProfileId: Id;
  linkedToMembershipId?: Id;
  monthlyCostShareEur?: number;
  /** As the person's plan states them; empty = no limit (or the provider's stated one, applied by the app). */
  dailyCheckInLimit?: number;
  monthlyCheckInLimit?: number;
}

export interface NewPlace {
  name: string;
  kind: Place['kind'];
  membershipIds: Id[];
  address?: string;
  categories: (ActivityCategory | string)[];
  equipment: string[];
  openingHours?: TimeWindow[];
  bookingUrl?: string;
  singleVisitPriceEur?: number;
  travelMin?: number;
  monthlyVisitLimit?: number;
}

const newId = (): Id => crypto.randomUUID();

const PROVIDER = /^[a-z0-9][a-z0-9-]*$/;

function euros(field: string, n: number | undefined): void {
  if (n !== undefined && (!Number.isFinite(n) || n < 0)) {
    throw new ValidationError(field, 'Amounts must be zero or more');
  }
}

/** Limits are whole numbers from 1; a limit of 0 would make the membership unusable, so it is left empty instead. */
function limit(field: string, n: number | undefined): void {
  if (n !== undefined && (!Number.isInteger(n) || n < 1)) {
    throw new ValidationError(field, 'Limits must be whole numbers from 1');
  }
}

/** Only https links may be stored (same rule as the import): blocks javascript:, data: and plain http. */
function httpsOnly(url: string | undefined): void {
  if (url === undefined) return;
  try {
    if (new URL(url).protocol === 'https:') return;
  } catch {
    // falls through
  }
  throw new ValidationError('bookingUrl', 'Only https links are allowed');
}

/** Drops empty optional fields so Dexie stores no empty strings. */
function trimmed(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

async function validateMembership(db: WeekbeatDB, m: NewMembership, selfId?: Id): Promise<void> {
  if (!PROVIDER.test(m.provider)) throw new ValidationError('provider', 'Choose a provider');
  if (!(await db.profiles.get(m.ownerProfileId))) throw new ValidationError('profile', 'Unknown profile');
  euros('monthlyCostShareEur', m.monthlyCostShareEur);
  limit('dailyCheckInLimit', m.dailyCheckInLimit);
  limit('monthlyCheckInLimit', m.monthlyCheckInLimit);
  if (m.linkedToMembershipId !== undefined) {
    const main = await db.memberships.get(m.linkedToMembershipId);
    if (!main || main.id === selfId) throw new ValidationError('linkedTo', 'Unknown main membership');
    if (main.linkedToMembershipId) throw new ValidationError('linkedTo', 'Link to a main membership');
    if (main.provider !== m.provider) throw new ValidationError('linkedTo', 'Same provider as the main membership');
  }
}

function membershipRecord(id: Id, m: NewMembership): Membership {
  const tier = trimmed(m.tier);
  return {
    id,
    provider: m.provider,
    ownerProfileId: m.ownerProfileId,
    ...(tier ? { tier } : {}),
    ...(m.linkedToMembershipId ? { linkedToMembershipId: m.linkedToMembershipId } : {}),
    ...(m.monthlyCostShareEur !== undefined ? { monthlyCostShareEur: m.monthlyCostShareEur } : {}),
    ...(m.dailyCheckInLimit !== undefined ? { dailyCheckInLimit: m.dailyCheckInLimit } : {}),
    ...(m.monthlyCheckInLimit !== undefined ? { monthlyCheckInLimit: m.monthlyCheckInLimit } : {}),
  };
}

export async function addMembership(db: WeekbeatDB, m: NewMembership): Promise<Membership> {
  await validateMembership(db, m);
  const record = membershipRecord(newId(), m);
  await db.memberships.add(record);
  return record;
}

export async function updateMembership(db: WeekbeatDB, id: Id, m: NewMembership): Promise<void> {
  if (!(await db.memberships.get(id))) throw new ValidationError('membership', 'Unknown membership');
  await validateMembership(db, m, id);
  if (
    m.linkedToMembershipId &&
    (await db.memberships.where('provider').equals(m.provider).toArray()).some(
      (other) => other.linkedToMembershipId === id,
    )
  ) {
    throw new ValidationError('linkedTo', 'A main membership cannot be linked itself');
  }
  await db.memberships.put(membershipRecord(id, m));
}

/** Removes the membership from every place and unlinks memberships that were linked to it. */
export async function deleteMembership(db: WeekbeatDB, id: Id): Promise<void> {
  await db.transaction('rw', db.memberships, db.places, async () => {
    await db.memberships.delete(id);
    await db.memberships
      .filter((m) => m.linkedToMembershipId === id)
      .modify((m) => {
        delete m.linkedToMembershipId;
      });
    await db.places
      .where('membershipIds')
      .equals(id)
      .modify((p) => {
        p.membershipIds = p.membershipIds.filter((x) => x !== id);
      });
  });
}

export async function membershipsOf(db: WeekbeatDB, profileId: Id): Promise<Membership[]> {
  return db.memberships.where('ownerProfileId').equals(profileId).toArray();
}

/**
 * The memberships to tick by default when a place is covered by `ids`: each one plus the memberships linked to it
 * (a Plus 1 starts ticked with its main membership; the person unticks it where it does not apply).
 */
export function withLinked(ids: readonly Id[], all: readonly Membership[]): Id[] {
  const out = new Set(ids);
  for (const m of all) if (m.linkedToMembershipId && ids.includes(m.linkedToMembershipId)) out.add(m.id);
  return [...out];
}

async function validatePlace(db: WeekbeatDB, p: NewPlace): Promise<void> {
  if (!p.name.trim()) throw new ValidationError('placeName', 'Name is required');
  if (!['partner', 'own', 'outdoor', 'home'].includes(p.kind)) throw new ValidationError('placeKind', 'Unknown kind');
  for (const id of p.membershipIds) {
    if (!(await db.memberships.get(id))) throw new ValidationError('membership', 'Unknown membership');
  }
  euros('singleVisitPriceEur', p.singleVisitPriceEur);
  if (p.travelMin !== undefined && (!Number.isInteger(p.travelMin) || p.travelMin < 0)) {
    throw new ValidationError('travelMin', 'Travel time must be a whole number of minutes');
  }
  limit('monthlyVisitLimit', p.monthlyVisitLimit);
  httpsOnly(trimmed(p.bookingUrl));
  if (p.openingHours) normalizeWindows(p.openingHours);
}

function placeRecord(id: Id, p: NewPlace): Place {
  const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort();
  const address = trimmed(p.address);
  const bookingUrl = trimmed(p.bookingUrl);
  const hours = p.openingHours && p.openingHours.length > 0 ? normalizeWindows(p.openingHours) : undefined;
  return {
    id,
    name: p.name.trim(),
    kind: p.kind,
    membershipIds: [...new Set(p.membershipIds)].sort(),
    categories: clean(p.categories),
    equipment: clean(p.equipment),
    ...(address ? { address } : {}),
    ...(hours ? { openingHours: hours } : {}),
    ...(bookingUrl ? { bookingUrl } : {}),
    ...(p.singleVisitPriceEur !== undefined ? { singleVisitPriceEur: p.singleVisitPriceEur } : {}),
    ...(p.travelMin !== undefined ? { travelMin: p.travelMin } : {}),
    ...(p.monthlyVisitLimit !== undefined ? { monthlyVisitLimit: p.monthlyVisitLimit } : {}),
  };
}

export async function addPlace(db: WeekbeatDB, p: NewPlace): Promise<Place> {
  await validatePlace(db, p);
  const record = placeRecord(newId(), p);
  await db.places.add(record);
  return record;
}

export async function updatePlace(db: WeekbeatDB, id: Id, p: NewPlace): Promise<void> {
  if (!(await db.places.get(id))) throw new ValidationError('place', 'Unknown place');
  await validatePlace(db, p);
  await db.places.put(placeRecord(id, p));
}

/** Accepted sessions keep their placeId; the week view shows them without a place name. */
export async function deletePlace(db: WeekbeatDB, id: Id): Promise<void> {
  // Programme sessions tied to the place lose it too (an emptied list plans nothing there until the person
  // picks another place).
  await db.transaction('rw', db.places, db.programmes, async () => {
    await db.places.delete(id);
    for (const p of await db.programmes.toArray()) {
      if (!p.typicalSessions.some((t) => t.placeIds?.includes(id))) continue;
      await db.programmes.update(p.id, {
        typicalSessions: p.typicalSessions.map((t) =>
          t.placeIds ? { ...t, placeIds: t.placeIds.filter((x) => x !== id) } : t,
        ),
      });
    }
  });
}

/** The person's membership that covers a place (main memberships first), if any. */
export function coveringMembership(
  memberships: readonly Membership[],
  profileId: Id,
  place: Pick<Place, 'membershipIds'>,
): Membership | undefined {
  return memberships
    .filter((m) => m.ownerProfileId === profileId && place.membershipIds.includes(m.id))
    .sort((a, b) => Number(Boolean(a.linkedToMembershipId)) - Number(Boolean(b.linkedToMembershipId)))[0];
}

export interface NewCheckIn {
  profileId: Id;
  placeId: Id;
  activityTypeId: Id;
  start: IsoDateTime;
  durationMin: number;
  /** The planned session this visit is; it is marked done. */
  plannedSessionId?: Id;
}

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Logs a visit to a place (the "check-in" tap). The source names the membership's provider
 * (`checkin:wellpass`), or `checkin` for a place no membership of the person covers. A visit counts toward
 * check-in limits and the value meter; nothing is sent to the provider.
 */
export async function checkIn(db: WeekbeatDB, c: NewCheckIn): Promise<LoggedActivity> {
  if (!LOCAL_DATE_TIME.test(c.start)) throw new ValidationError('time', 'Start must be YYYY-MM-DDTHH:mm');
  if (!Number.isInteger(c.durationMin) || c.durationMin < 1) {
    throw new ValidationError('sessionMin', 'Duration must be a positive whole number of minutes');
  }
  if (!c.activityTypeId.trim()) throw new ValidationError('activity', 'Choose an activity');
  return db.transaction(
    'rw',
    [db.profiles, db.places, db.memberships, db.plannedSessions, db.loggedActivities],
    async () => {
      if (!(await db.profiles.get(c.profileId))) throw new ValidationError('profile', 'Unknown profile');
      const place = await db.places.get(c.placeId);
      if (!place) throw new ValidationError('place', 'Unknown place');
      if (c.plannedSessionId) {
        const s = await db.plannedSessions.get(c.plannedSessionId);
        if (!s || s.profileId !== c.profileId) throw new ValidationError('session', 'Unknown session');
        await db.plannedSessions.update(s.id, { status: 'done' });
      }
      const m = coveringMembership(await db.memberships.toArray(), c.profileId, place);
      const log: LoggedActivity = {
        id: newId(),
        profileId: c.profileId,
        activityTypeId: c.activityTypeId,
        start: c.start,
        durationMin: c.durationMin,
        source: m ? `checkin:${m.provider}` : 'checkin',
        ...(m ? { sourceRef: m.id } : {}),
        placeId: place.id,
        ...(c.plannedSessionId ? { plannedSessionId: c.plannedSessionId } : {}),
      };
      await db.loggedActivities.add(log);
      return log;
    },
  );
}

export interface ValueMeter {
  /** Visits this month at places one of the person's memberships covers. */
  visits: number;
  /** Visits at places with a single-visit price. */
  priced: number;
  /** Sum of those single-visit prices. */
  valueEur: number;
  /** Sum of the person's monthly shares; undefined when none is entered. */
  shareEur?: number;
}

/**
 * What the month's membership visits were worth at single-visit prices, next to the person's own share. Pure
 * information: no target, no loss wording (the app shows it neutrally and hides it without visits).
 */
export function valueMeter(
  profileId: Id,
  month: string,
  logs: readonly LoggedActivity[],
  places: readonly Place[],
  memberships: readonly Membership[],
): ValueMeter {
  const own = memberships.filter((m) => m.ownerProfileId === profileId);
  const byId = new Map(places.map((p) => [p.id, p]));
  let visits = 0;
  let priced = 0;
  let valueEur = 0;
  for (const l of logs) {
    if (l.profileId !== profileId || l.mergedIntoId || !l.placeId || !l.start.startsWith(month)) continue;
    const place = byId.get(l.placeId);
    if (!place || !own.some((m) => place.membershipIds.includes(m.id))) continue;
    visits++;
    if (place.singleVisitPriceEur !== undefined) {
      priced++;
      valueEur += place.singleVisitPriceEur;
    }
  }
  const shares = own.flatMap((m) => (m.monthlyCostShareEur === undefined ? [] : [m.monthlyCostShareEur]));
  return {
    visits,
    priced,
    valueEur: Math.round(valueEur * 100) / 100,
    ...(shares.length > 0 ? { shareEur: Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100 } : {}),
  };
}
