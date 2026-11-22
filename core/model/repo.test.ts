import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WeekbeatDB } from './db.ts';
import {
  ValidationError,
  addProfile,
  createHousehold,
  getAvailability,
  getHousehold,
  normalizeWindows,
  savePreferences,
  setWindows,
  updateProfile,
  type NewProfile,
} from './repo.ts';

const anna: NewProfile = { name: ' Anna ', lang: 'de', level: 'intermediate', goal: { kind: 'sessions', target: 3 } };
const ben: NewProfile = { name: 'Ben', lang: 'en', level: 'beginner', goal: { kind: 'minutes', target: 150 } };

let db: WeekbeatDB;
beforeEach(() => {
  db = new WeekbeatDB(`test-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await db.delete();
});

describe('household and profiles', () => {
  it('creates a household with its first profile and empty availability', async () => {
    const { household, profile } = await createHousehold(db, 'Unser Nest', anna);
    expect(profile.name).toBe('Anna');
    expect(household.memberIds).toEqual([profile.id]);
    expect((await getHousehold(db))?.name).toBe('Unser Nest');
    expect((await getAvailability(db, profile.id))?.windows).toEqual([]);
  });

  it('allows only one household', async () => {
    await createHousehold(db, 'A', anna);
    await expect(createHousehold(db, 'B', ben)).rejects.toThrow(ValidationError);
  });

  it('adds further profiles to the household', async () => {
    await createHousehold(db, 'Wir', anna);
    const p = await addProfile(db, ben);
    expect((await getHousehold(db))?.memberIds).toContain(p.id);
    expect(await db.profiles.count()).toBe(2);
  });

  it('needs a household before adding profiles', async () => {
    await expect(addProfile(db, ben)).rejects.toThrow(/household/i);
  });

  it('validates names and goals', async () => {
    await expect(createHousehold(db, ' ', anna)).rejects.toThrow(ValidationError);
    await expect(createHousehold(db, 'Wir', { ...anna, name: '' })).rejects.toThrow(/Name/);
    await expect(createHousehold(db, 'Wir', { ...anna, goal: { kind: 'sessions', target: 0 } })).rejects.toThrow(
      /goal/,
    );
  });

  it('updates a profile and keeps extra goals', async () => {
    const { profile } = await createHousehold(db, 'Wir', anna);
    await db.profiles.update(profile.id, {
      goals: [anna.goal, { kind: 'minutes', target: 60, categories: ['strength'] }],
    });
    await updateProfile(db, profile.id, { ...anna, name: 'Anna M.', goal: { kind: 'sessions', target: 4 } });
    const p = await db.profiles.get(profile.id);
    expect(p?.name).toBe('Anna M.');
    expect(p?.goals).toHaveLength(2);
    expect(p?.goals[0]?.target).toBe(4);
    await expect(updateProfile(db, 'nope', anna)).rejects.toThrow(/Unknown/);
  });

  it('stores, validates and clears the usual session length', async () => {
    const { profile } = await createHousehold(db, 'Wir', { ...anna, sessionMin: 45 });
    expect((await db.profiles.get(profile.id))?.preferredSessionMin).toBe(45);
    for (const sessionMin of [0, -10, 12.5, Number.NaN])
      await expect(updateProfile(db, profile.id, { ...anna, sessionMin })).rejects.toThrow(/Session length/);
    await updateProfile(db, profile.id, { ...anna, sessionMin: 30 });
    expect((await db.profiles.get(profile.id))?.preferredSessionMin).toBe(30);
    await updateProfile(db, profile.id, anna);
    const cleared = await db.profiles.get(profile.id);
    expect(cleared && 'preferredSessionMin' in cleared).toBe(false);
    expect((await addProfile(db, ben)).preferredSessionMin).toBeUndefined();
  });
});

describe('preferences (interview)', () => {
  it('stores hobbies, length and automatic planning, and can clear the length', async () => {
    const { profile } = await createHousehold(db, 'Wir', anna);
    await savePreferences(db, profile.id, { hobbies: ['yoga', 'mtb', 'yoga'], sessionMin: 45, autoPlan: true });
    let p = await db.profiles.get(profile.id);
    expect(p).toMatchObject({ hobbies: ['mtb', 'yoga'], preferredSessionMin: 45, autoPlan: true });
    await savePreferences(db, profile.id, { hobbies: [], autoPlan: false });
    p = await db.profiles.get(profile.id);
    expect(p).toMatchObject({ hobbies: [], autoPlan: false });
    expect(p && 'preferredSessionMin' in p).toBe(false);
  });

  it('validates the answers', async () => {
    const { profile } = await createHousehold(db, 'Wir', anna);
    await expect(savePreferences(db, profile.id, { hobbies: [], sessionMin: 0, autoPlan: false })).rejects.toThrow(
      /Session length/,
    );
    await expect(savePreferences(db, profile.id, { hobbies: [' '], autoPlan: false })).rejects.toThrow(/Hobbies/);
    await expect(savePreferences(db, 'nope', { hobbies: [], autoPlan: false })).rejects.toThrow(/Unknown/);
  });
});

describe('availability', () => {
  it('normalizes: sorts and merges overlapping windows per day', () => {
    expect(
      normalizeWindows([
        { day: 3, from: '18:00', to: '20:00' },
        { day: 1, from: '19:00', to: '21:00' },
        { day: 1, from: '18:00', to: '19:30' },
        { day: 1, from: '06:00', to: '07:00' },
      ]),
    ).toEqual([
      { day: 1, from: '06:00', to: '07:00' },
      { day: 1, from: '18:00', to: '21:00' },
      { day: 3, from: '18:00', to: '20:00' },
    ]);
  });

  it('rejects invalid windows', () => {
    expect(() => normalizeWindows([{ day: 1, from: '20:00', to: '18:00' }])).toThrow(ValidationError);
    expect(() => normalizeWindows([{ day: 8 as never, from: '18:00', to: '19:00' }])).toThrow(/Day/);
    expect(() => normalizeWindows([{ day: 1, from: '25:00', to: '26:00' }])).toThrow(/HH:mm/);
  });

  it('stores windows per profile', async () => {
    const { profile } = await createHousehold(db, 'Wir', anna);
    await setWindows(db, profile.id, [{ day: 6, from: '09:00', to: '12:00' }]);
    expect((await getAvailability(db, profile.id))?.windows).toEqual([{ day: 6, from: '09:00', to: '12:00' }]);
    await setWindows(db, 'orphan', [{ day: 1, from: '09:00', to: '10:00' }]);
    expect((await getAvailability(db, 'orphan'))?.windows).toHaveLength(1);
  });
});
