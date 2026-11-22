import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { ImportError, WeekbeatDB, exportAll, exportFileName, importAll, parseExportFile } from './db.ts';

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

describe('parseExportFile', () => {
  const ok = {
    format: 'weekbeat-export',
    version: 1,
    exportedAt: '2026-11-22T10:00:00Z',
    tables: { households: [{ id: 'h1' }] },
  };

  it('accepts a valid file', () => {
    expect(parseExportFile(JSON.stringify(ok)).tables.households).toHaveLength(1);
  });

  it.each([
    ['not-json', '{nope'],
    ['not-weekbeat', JSON.stringify({ format: 'other', version: 1, tables: {} })],
    ['not-weekbeat', 'null'],
    ['too-new', JSON.stringify({ ...ok, version: 99 })],
    ['bad-table', JSON.stringify({ ...ok, tables: { households: [{ name: 'no id' }] } })],
    ['bad-table', JSON.stringify({ ...ok, tables: { households: 'x' } })],
  ])('rejects %s', (reason, text) => {
    try {
      parseExportFile(text);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).reason).toBe(reason);
    }
  });

  it('names files by local date', () => {
    expect(exportFileName(new Date(2026, 10, 2, 23, 30))).toBe('weekbeat-2026-11-02.json');
  });
});
