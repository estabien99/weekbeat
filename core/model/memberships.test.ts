import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WeekbeatDB } from './db.ts';
import {
  addMembership,
  checkIn,
  coveringMembership,
  valueMeter,
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
import { completeSession } from './sessions.ts';
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

describe('check-in limits as entered', () => {
  it('stores whole-number limits from 1 and rejects others', async () => {
    const m = await addMembership(db, {
      provider: 'urban-sports-club',
      ownerProfileId: a,
      dailyCheckInLimit: 1,
      monthlyCheckInLimit: 8,
    });
    expect(m).toMatchObject({ dailyCheckInLimit: 1, monthlyCheckInLimit: 8 });
    for (const bad of [0, 2.5, -1]) {
      await expect(addMembership(db, { provider: 'gym', ownerProfileId: a, monthlyCheckInLimit: bad })).rejects.toThrow(
        ValidationError,
      );
      await expect(addPlace(db, { ...studio([]), monthlyVisitLimit: bad })).rejects.toThrow(ValidationError);
    }
    expect(await addPlace(db, { ...studio([m.id]), monthlyVisitLimit: 4 })).toMatchObject({ monthlyVisitLimit: 4 });
  });
});

describe('check-in and value meter', () => {
  it('logs a check-in with the covering membership and marks the planned session done', async () => {
    const main = await addMembership(db, { provider: 'wellpass', ownerProfileId: a, monthlyCostShareEur: 0 });
    const place = await addPlace(db, { ...studio([main.id]), singleVisitPriceEur: 15.5 });
    await db.plannedSessions.add({
      id: 's1',
      profileId: a,
      activityTypeId: 'weight-training',
      placeId: place.id,
      start: '2026-11-23T18:00',
      durationMin: 45,
      why: { de: '', en: '' },
      status: 'accepted',
    });
    const log = await checkIn(db, {
      profileId: a,
      placeId: place.id,
      activityTypeId: 'weight-training',
      start: '2026-11-23T18:05',
      durationMin: 45,
      plannedSessionId: 's1',
    });
    expect(log).toMatchObject({ source: 'checkin:wellpass', sourceRef: main.id, placeId: place.id });
    expect((await db.plannedSessions.get('s1'))?.status).toBe('done');
  });

  it('rejects bad input and other people’s sessions', async () => {
    const place = await addPlace(db, studio([]));
    const base = {
      profileId: a,
      placeId: place.id,
      activityTypeId: 'yoga',
      start: '2026-11-23T18:00',
      durationMin: 30,
    };
    await expect(checkIn(db, { ...base, start: 'yesterday' })).rejects.toThrow(ValidationError);
    await expect(checkIn(db, { ...base, durationMin: 0 })).rejects.toThrow(ValidationError);
    await expect(checkIn(db, { ...base, activityTypeId: ' ' })).rejects.toThrow(ValidationError);
    await expect(checkIn(db, { ...base, placeId: 'nope' })).rejects.toThrow(ValidationError);
    await expect(checkIn(db, { ...base, profileId: 'nobody' })).rejects.toThrow(ValidationError);
    await db.plannedSessions.add({
      id: 'theirs',
      profileId: b,
      activityTypeId: 'yoga',
      start: '2026-11-23T18:00',
      durationMin: 30,
      why: { de: '', en: '' },
      status: 'accepted',
    });
    await expect(checkIn(db, { ...base, plannedSessionId: 'theirs' })).rejects.toThrow(ValidationError);
    // A place no membership covers is still a visit, with a plain source.
    expect(await checkIn(db, base)).toMatchObject({ source: 'checkin', placeId: place.id });
  });

  it('marks a session done once and logs it once (a visit at a place)', async () => {
    const place = await addPlace(db, studio([]));
    const s = {
      id: 's2',
      profileId: a,
      activityTypeId: 'yoga',
      placeId: place.id,
      start: '2026-11-24T18:00',
      durationMin: 30,
      why: { de: '', en: '' },
      status: 'accepted' as const,
    };
    await db.plannedSessions.add(s);
    await completeSession(db, 's2');
    await completeSession(db, 's2');
    expect(await db.loggedActivities.where('plannedSessionId').equals('s2').count()).toBe(1);
    await db.plannedSessions.add({ ...s, id: 's3', placeId: undefined });
    // A session without a place (e.g. a Coach workout at no particular place) is logged as manual, once.
    await completeSession(db, 's3');
    await completeSession(db, 's3');
    expect((await db.plannedSessions.get('s3'))?.status).toBe('done');
    const logs = await db.loggedActivities.where('plannedSessionId').equals('s3').toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ source: 'manual', activityTypeId: 'yoga', start: '2026-11-24T18:00' });
    expect(logs[0]?.placeId).toBeUndefined();
    await expect(completeSession(db, 'missing')).rejects.toThrow(ValidationError);
  });

  it('prefers the main membership when several cover a place', () => {
    const all = [
      { id: 'plus', provider: 'wellpass', ownerProfileId: a, linkedToMembershipId: 'x' },
      { id: 'main', provider: 'urban-sports-club', ownerProfileId: a },
      { id: 'other', provider: 'gym', ownerProfileId: b },
    ];
    expect(coveringMembership(all, a, { membershipIds: ['plus', 'main', 'other'] })?.id).toBe('main');
    expect(coveringMembership(all, a, { membershipIds: ['other'] })).toBeUndefined();
  });

  it('adds up single-visit prices of the month’s membership visits next to the own share', () => {
    const memberships = [
      { id: 'wp', provider: 'wellpass', ownerProfileId: a, monthlyCostShareEur: 25 },
      { id: 'gym', provider: 'gym', ownerProfileId: a },
    ];
    const places = [
      {
        id: 'p1',
        name: 'A',
        kind: 'partner' as const,
        membershipIds: ['wp'],
        categories: [],
        equipment: [],
        singleVisitPriceEur: 15.5,
      },
      { id: 'p2', name: 'B', kind: 'partner' as const, membershipIds: ['wp'], categories: [], equipment: [] },
      {
        id: 'p3',
        name: 'C',
        kind: 'own' as const,
        membershipIds: [],
        categories: [],
        equipment: [],
        singleVisitPriceEur: 99,
      },
    ];
    const log = (id: string, start: string, placeId?: string, over = {}) => ({
      id,
      profileId: a,
      activityTypeId: 'yoga',
      start,
      durationMin: 30,
      source: 'checkin',
      ...(placeId ? { placeId } : {}),
      ...over,
    });
    const logs = [
      log('1', '2026-11-03T18:00', 'p1'),
      log('2', '2026-11-10T18:00', 'p1'),
      log('3', '2026-11-12T18:00', 'p2'), // no price
      log('4', '2026-11-13T18:00', 'p3'), // not covered by a membership
      log('5', '2026-10-30T18:00', 'p1'), // other month
      log('6', '2026-11-14T18:00'), // no place
      log('7', '2026-11-15T18:00', 'p1', { mergedIntoId: '1' }), // merged into another log
      log('8', '2026-11-16T18:00', 'p1', { profileId: b }), // someone else
    ];
    expect(valueMeter(a, '2026-11', logs, places, memberships)).toEqual({
      visits: 3,
      priced: 2,
      valueEur: 31,
      shareEur: 25,
    });
    expect(valueMeter(b, '2026-11', logs, places, [])).toEqual({ visits: 0, priced: 0, valueEur: 0 });
  });
});
