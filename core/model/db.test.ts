import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { WeekbeatDB, exportAll, importAll } from './db.ts';

let db: WeekbeatDB;
afterEach(async () => {
  await db.delete();
});

describe('WeekbeatDB', () => {
  it('round-trips data through export and import', async () => {
    db = new WeekbeatDB('test-roundtrip');
    await db.households.add({ id: 'h1', name: 'Wir', memberIds: ['p1'], sharedGoals: [], gameMode: 'solo' });
    const file = await exportAll(db);
    expect(file.tables.households).toHaveLength(1);

    await db.households.clear();
    await importAll(db, JSON.parse(JSON.stringify(file)));
    expect(await db.households.get('h1')).toMatchObject({ name: 'Wir' });
  });

  it('rejects files that are not Weekbeat exports', async () => {
    db = new WeekbeatDB('test-reject');
    await expect(importAll(db, { format: 'other', version: 1, exportedAt: '', tables: {} } as never)).rejects.toThrow();
    await expect(
      importAll(db, { format: 'weekbeat-export', version: 1, exportedAt: '', tables: { nope: [] } }),
    ).rejects.toThrow(/Unknown tables/);
  });
});
