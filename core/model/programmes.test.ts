import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WeekbeatDB } from './db.ts';
import { addPlace, deletePlace } from './memberships.ts';
import { deleteProgramme, programmeOf, saveProgramme } from './programmes.ts';
import { createHousehold } from './repo.ts';
import type { Programme } from './types.ts';

let db: WeekbeatDB;
let profileId: string;
beforeEach(async () => {
  db = new WeekbeatDB(`test-${crypto.randomUUID()}`);
  const { profile } = await createHousehold(db, 'H', {
    name: 'A',
    lang: 'de',
    level: 'beginner',
    goal: { kind: 'sessions', target: 3 },
  });
  profileId = profile.id;
});
afterEach(async () => {
  await db.delete();
});

const programme = (over: Partial<Omit<Programme, 'id'>> = {}): Omit<Programme, 'id'> => ({
  profileId,
  name: 'Freeletics Coach',
  connectorId: 'freeletics-coach',
  daysPerWeek: 3,
  typicalSessions: [{ activityTypeId: 'bodyweight-vigorous', durationMin: 30, equipment: [] }],
  ...over,
});

describe('programmes', () => {
  it('keeps one programme per person and connector', async () => {
    const id = await saveProgramme(db, programme({ weekdays: [5, 1, 3, 1] }));
    expect(await saveProgramme(db, programme({ daysPerWeek: 2 }))).toBe(id);
    const saved = await programmeOf(db, profileId, 'freeletics-coach');
    expect(saved).toMatchObject({ id, daysPerWeek: 2 });
    expect(saved?.weekdays).toBeUndefined();
    await saveProgramme(db, programme({ weekdays: [5, 1, 3, 1] }));
    expect((await db.programmes.get(id))?.weekdays).toEqual([1, 3, 5]);
    await deleteProgramme(db, id);
    expect(await db.programmes.count()).toBe(0);
  });

  it('rejects invalid plans', async () => {
    await expect(saveProgramme(db, programme({ daysPerWeek: 0 }))).rejects.toMatchObject({ field: 'daysPerWeek' });
    await expect(saveProgramme(db, programme({ typicalSessions: [] }))).rejects.toMatchObject({
      field: 'programmeKind',
    });
    const at = (placeIds: string[]) =>
      programme({ typicalSessions: [{ activityTypeId: 'weight-training', durationMin: 45, equipment: [], placeIds }] });
    await expect(saveProgramme(db, at([]))).rejects.toMatchObject({ field: 'programmePlaces' });
    await expect(saveProgramme(db, at(['nope']))).rejects.toMatchObject({ field: 'programmePlaces' });
    await expect(saveProgramme(db, programme({ profileId: 'nobody' }))).rejects.toMatchObject({ field: 'profile' });
  });

  it('drops a deleted place from programme sessions', async () => {
    const gym = await addPlace(db, { name: 'Gym', kind: 'partner', membershipIds: [], categories: [], equipment: [] });
    const id = await saveProgramme(
      db,
      programme({
        typicalSessions: [{ activityTypeId: 'weight-training', durationMin: 45, equipment: [], placeIds: [gym.id] }],
      }),
    );
    await deletePlace(db, gym.id);
    expect((await db.programmes.get(id))?.typicalSessions[0]?.placeIds).toEqual([]);
  });
});
