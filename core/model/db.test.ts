import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { EXPORT_TABLES, ImportError, WeekbeatDB, exportAll, exportFileName, importAll, parseExportFile } from './db.ts';
import { TABLE_SCHEMAS } from './validate.ts';

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
  const household = { id: 'h1', name: 'Wir', memberIds: [], sharedGoals: [], gameMode: 'solo' };
  const ok = {
    format: 'weekbeat-export',
    version: 1,
    exportedAt: '2026-11-22T10:00:00Z',
    tables: { households: [household] },
  };
  const withPlace = (bookingUrl: string) =>
    JSON.stringify({
      ...ok,
      tables: {
        places: [
          { id: 'p', name: 'Studio', kind: 'partner', membershipIds: [], categories: [], equipment: [], bookingUrl },
        ],
      },
    });

  it('accepts a valid file', () => {
    expect(parseExportFile(JSON.stringify(ok)).tables.households).toHaveLength(1);
  });

  it.each([
    ['not-json', '{nope'],
    ['not-weekbeat', JSON.stringify({ format: 'other', version: 1, tables: {} })],
    ['not-weekbeat', 'null'],
    ['too-new', JSON.stringify({ ...ok, version: 99 })],
    ['too-new', JSON.stringify({ ...ok, version: 'x' })],
    ['too-new', JSON.stringify({ ...ok, version: undefined })],
    ['too-new', JSON.stringify({ ...ok, version: 0.5 })],
    ['bad-table', JSON.stringify({ ...ok, tables: { households: [{ ...household, extra: 1 }] } })],
    ['bad-table', JSON.stringify({ ...ok, tables: { households: [{ ...household, gameMode: 'hardcore' }] } })],
    ['bad-table', JSON.stringify({ ...ok, tables: { connectorSecrets: [] } })],
    ['bad-table', withPlace('javascript:alert(1)')],
    ['bad-table', withPlace('http://example.org')],
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

  it('accepts https links', () => {
    expect(parseExportFile(withPlace('https://example.org/book')).tables.places).toHaveLength(1);
  });

  it('names files by local date', () => {
    expect(exportFileName(new Date(2026, 10, 2, 23, 30))).toBe('weekbeat-2026-11-02.json');
  });
});

describe('export scope', () => {
  it('has a schema for exactly the exported tables, and they are all database tables', () => {
    expect(Object.keys(TABLE_SCHEMAS).sort()).toEqual([...EXPORT_TABLES].sort());
    const tables = new WeekbeatDB('test-scope').tables.map((t) => t.name);
    for (const name of EXPORT_TABLES) expect(tables).toContain(name);
  });

  it('exports only the allowlisted tables', async () => {
    db = new WeekbeatDB('test-export-scope');
    const file = await exportAll(db);
    expect(Object.keys(file.tables).sort()).toEqual([...EXPORT_TABLES].sort());
  });

  it('never exports fields that look like secrets', () => {
    // Guard for SECURITY.md: connector keys must live outside the exported tables.
    const source = Object.values(TABLE_SCHEMAS)
      .map((s) => s.toString())
      .join('\n');
    const schemaKeys = JSON.stringify(TABLE_SCHEMAS);
    expect(schemaKeys + source).not.toMatch(/secret|token|api_?key|password/i);
  });

  it('rejects the whole import when one row is invalid and keeps the old data', async () => {
    db = new WeekbeatDB('test-atomic');
    await db.households.add({ id: 'h1', name: 'Alt', memberIds: [], sharedGoals: [], gameMode: 'solo' });
    const bad = {
      format: 'weekbeat-export' as const,
      version: 1,
      exportedAt: '',
      tables: { households: [{ id: 'h2', name: 'Neu', memberIds: [], sharedGoals: [], gameMode: 'solo' }, { id: 3 }] },
    };
    await expect(importAll(db, bad)).rejects.toThrow(ImportError);
    expect((await db.households.toArray()).map((h) => h.name)).toEqual(['Alt']);
  });
});
