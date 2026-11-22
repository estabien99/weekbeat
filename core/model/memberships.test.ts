import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WeekbeatDB } from './db.ts';
import {
  addMembership,
  addPlace,
  deleteMembership,
  deletePlace,
  membershipsOf,
  updateMembership,
  updatePlace,
  withLinked,
  type NewPlace,
} from './memberships.ts';
import { ValidationError, addProfile, createHousehold, type NewProfile } from './repo.ts';
import type { Id } from './types.ts';

const anna: NewProfile = { name: 'Anna', lang: 'de', level: 'intermediate', goal: { kind: 'sessions', target: 3 } };
const ben: NewProfile = { name: 'Ben', lang: 'de', level: 'beginner', goal: { kind: 'sessions', target: 2 } };

let db: WeekbeatDB;
let a: Id;
let b: Id;
beforeEach(async () => {
  db = new WeekbeatDB(`test-${crypto.randomUUID()}`);
  a = (await createHousehold(db, 'Nest', anna)).profile.id;
  b = (await addProfile(db, ben)).id;
});
afterEach(async () => {
  await db.delete();
});

const studio = (membershipIds: Id[]): NewPlace => ({
  name: ' Studio Nord ',
  kind: 'partner',
  membershipIds,
  categories: ['strength', 'strength', ' '],
  equipment: ['kettlebell', 'barbell'],
});

describe('memberships', () => {
  it('adds a membership and a linked Plus 1 of the same provider', async () => {
    const main = await addMembership(db, {
      provider: 'wellpass',
      ownerProfileId: a,
      tier: ' ',
      monthlyCostShareEur: 0,
    });
    expect(main).not.toHaveProperty('tier');
    const plus = await addMembership(db, {
      provider: 'wellpass',
      ownerProfileId: b,
      linkedToMembershipId: main.id,
      monthlyCostShareEur: 25,
    });
    expect(plus.linkedToMembershipId).toBe(main.id);
    expect(await membershipsOf(db, b)).toEqual([plus]);
  });

  it('rejects unknown providers, owners, negative amounts and bad links', async () => {
    await expect(addMembership(db, { provider: '', ownerProfileId: a })).rejects.toThrow(ValidationError);
    await expect(addMembership(db, { provider: 'wellpass', ownerProfileId: 'nobody' })).rejects.toThrow(
      ValidationError,
    );
    await expect(
      addMembership(db, { provider: 'wellpass', ownerProfileId: a, monthlyCostShareEur: -1 }),
    ).rejects.toThrow(ValidationError);
    const main = await addMembership(db, { provider: 'wellpass', ownerProfileId: a });
    await expect(
      addMembership(db, { provider: 'urban-sports-club', ownerProfileId: b, linkedToMembershipId: main.id }),
    ).rejects.toThrow(ValidationError);
    const plus = await addMembership(db, { provider: 'wellpass', ownerProfileId: b, linkedToMembershipId: main.id });
    // No chains: a Plus 1 cannot be the main membership of another one, and a main one cannot become linked.
    await expect(
      addMembership(db, { provider: 'wellpass', ownerProfileId: a, linkedToMembershipId: plus.id }),
    ).rejects.toThrow(ValidationError);
    const other = await addMembership(db, { provider: 'wellpass', ownerProfileId: b });
    await expect(
      updateMembership(db, main.id, { provider: 'wellpass', ownerProfileId: a, linkedToMembershipId: other.id }),
    ).rejects.toThrow(ValidationError);
    await expect(
      updateMembership(db, main.id, { provider: 'wellpass', ownerProfileId: a, linkedToMembershipId: main.id }),
    ).rejects.toThrow(ValidationError);
  });

  it('updates a membership and clears emptied fields', async () => {
    const m = await addMembership(db, { provider: 'gym', ownerProfileId: a, tier: 'Basic', monthlyCostShareEur: 30 });
    await updateMembership(db, m.id, { provider: 'gym', ownerProfileId: a });
    expect(await db.memberships.get(m.id)).toEqual({ id: m.id, provider: 'gym', ownerProfileId: a });
  });

  it('deleting a membership removes it from places and unlinks its Plus 1', async () => {
    const main = await addMembership(db, { provider: 'wellpass', ownerProfileId: a });
    const plus = await addMembership(db, { provider: 'wellpass', ownerProfileId: b, linkedToMembershipId: main.id });
    const place = await addPlace(db, studio([main.id, plus.id]));
    await deleteMembership(db, main.id);
    expect(await db.memberships.get(main.id)).toBeUndefined();
    expect((await db.memberships.get(plus.id))?.linkedToMembershipId).toBeUndefined();
    expect((await db.places.get(place.id))?.membershipIds).toEqual([plus.id]);
  });

  it('pre-ticks linked memberships with their main membership', () => {
    const all = [
      { id: 'main', provider: 'wellpass', ownerProfileId: a },
      { id: 'plus', provider: 'wellpass', ownerProfileId: b, linkedToMembershipId: 'main' },
      { id: 'usc', provider: 'urban-sports-club', ownerProfileId: b },
    ];
    expect(withLinked(['main'], all).sort()).toEqual(['main', 'plus']);
    expect(withLinked(['usc'], all)).toEqual(['usc']);
  });
});

describe('places', () => {
  it('stores a cleaned place with explicit memberships', async () => {
    const main = await addMembership(db, { provider: 'wellpass', ownerProfileId: a });
    const place = await addPlace(db, {
      ...studio([main.id]),
      bookingUrl: 'https://example.org/book',
      singleVisitPriceEur: 17.5,
      travelMin: 10,
      openingHours: [
        { day: 1, from: '06:00', to: '12:00' },
        { day: 1, from: '11:00', to: '22:00' },
      ],
    });
    expect(place).toMatchObject({
      name: 'Studio Nord',
      membershipIds: [main.id],
      categories: ['strength'],
      equipment: ['barbell', 'kettlebell'],
      openingHours: [{ day: 1, from: '06:00', to: '22:00' }],
    });
    expect(place).not.toHaveProperty('address');
  });

  it('rejects empty names, unknown memberships, non-https links and bad numbers', async () => {
    await expect(addPlace(db, { ...studio([]), name: ' ' })).rejects.toThrow(ValidationError);
    await expect(addPlace(db, studio(['nope']))).rejects.toThrow(ValidationError);
    for (const bookingUrl of ['javascript:alert(1)', 'http://example.org', 'not a url']) {
      await expect(addPlace(db, { ...studio([]), bookingUrl })).rejects.toThrow(ValidationError);
    }
    await expect(addPlace(db, { ...studio([]), singleVisitPriceEur: -5 })).rejects.toThrow(ValidationError);
    await expect(addPlace(db, { ...studio([]), travelMin: 2.5 })).rejects.toThrow(ValidationError);
    await expect(
      addPlace(db, { ...studio([]), openingHours: [{ day: 1, from: '22:00', to: '06:00' }] }),
    ).rejects.toThrow(ValidationError);
  });

  it('updates and deletes a place', async () => {
    const place = await addPlace(db, studio([]));
    await updatePlace(db, place.id, { ...studio([]), name: 'Studio Süd', singleVisitPriceEur: 12 });
    expect(await db.places.get(place.id)).toMatchObject({ name: 'Studio Süd', singleVisitPriceEur: 12 });
    await expect(updatePlace(db, 'missing', studio([]))).rejects.toThrow(ValidationError);
    await deletePlace(db, place.id);
    expect(await db.places.get(place.id)).toBeUndefined();
  });
});
