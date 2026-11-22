import type { WeekbeatDB } from './db.ts';
import { ValidationError, normalizeWindows } from './repo.ts';
import type { ActivityCategory, Id, Membership, Place, TimeWindow } from './types.ts';

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
}

const newId = (): Id => crypto.randomUUID();

const PROVIDER = /^[a-z0-9][a-z0-9-]*$/;

function euros(field: string, n: number | undefined): void {
  if (n !== undefined && (!Number.isFinite(n) || n < 0)) {
    throw new ValidationError(field, 'Amounts must be zero or more');
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
  await db.places.delete(id);
}
