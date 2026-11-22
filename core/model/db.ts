import Dexie, { type EntityTable } from 'dexie';
import type {
  ActivityType,
  Availability,
  Badge,
  Household,
  LoggedActivity,
  Membership,
  Place,
  PlannedSession,
  Profile,
  Programme,
  Quest,
  XPEvent,
} from './types.ts';
import { validateRows } from './validate.ts';

/**
 * Local-first storage in IndexedDB. Nothing leaves the device unless a connector the user
 * enabled sends it. Knowledge rules are not stored here: they ship with the app (knowledge/).
 * Schema changes: add a new db.version(n) block, never edit an old one.
 */
export class WeekbeatDB extends Dexie {
  households!: EntityTable<Household, 'id'>;
  profiles!: EntityTable<Profile, 'id'>;
  activityTypes!: EntityTable<ActivityType, 'id'>;
  programmes!: EntityTable<Programme, 'id'>;
  memberships!: EntityTable<Membership, 'id'>;
  places!: EntityTable<Place, 'id'>;
  availability!: EntityTable<Availability, 'id'>;
  plannedSessions!: EntityTable<PlannedSession, 'id'>;
  loggedActivities!: EntityTable<LoggedActivity, 'id'>;
  quests!: EntityTable<Quest, 'id'>;
  badges!: EntityTable<Badge, 'id'>;
  xpEvents!: EntityTable<XPEvent, 'id'>;

  constructor(name = 'weekbeat') {
    super(name);
    this.version(1).stores({
      households: 'id',
      profiles: 'id, householdId',
      activityTypes: 'id, category',
      programmes: 'id, profileId',
      memberships: 'id, provider, ownerProfileId',
      places: 'id, kind, *membershipIds',
      availability: 'id, profileId',
      plannedSessions: 'id, profileId, start, status, [profileId+start]',
      loggedActivities: 'id, profileId, start, source, plannedSessionId, [profileId+start]',
      quests: 'id, profileId, householdId, to',
      badges: 'id, profileId, key',
      xpEvents: 'id, profileId, at',
    });
  }
}

export const EXPORT_FORMAT = 'weekbeat-export';
export const EXPORT_VERSION = 1;

/**
 * The only tables that go into an export file. Explicit on purpose: a new table (e.g. connector settings with
 * API keys) is never exported unless it is added here, and its schema must exist in validate.ts.
 */
export const EXPORT_TABLES = [
  'households',
  'profiles',
  'activityTypes',
  'programmes',
  'memberships',
  'places',
  'availability',
  'plannedSessions',
  'loggedActivities',
  'quests',
  'badges',
  'xpEvents',
] as const;

const isSupportedVersion = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= EXPORT_VERSION;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

/** Whole database as one JSON-serialisable object (export/import principle). */
export async function exportAll(db: WeekbeatDB): Promise<ExportFile> {
  const tables: Record<string, unknown[]> = {};
  for (const name of EXPORT_TABLES) tables[name] = await db.table(name).toArray();
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), tables };
}

/**
 * Replaces the exported tables with an export file. Everything is checked before anything is written:
 * unknown tables and any invalid row reject the whole file.
 */
export async function importAll(db: WeekbeatDB, file: ExportFile): Promise<void> {
  checkFile(file);
  const tables = EXPORT_TABLES.map((name) => db.table(name));
  await db.transaction('rw', tables, async () => {
    for (const table of tables) {
      await table.clear();
      const rows = file.tables[table.name];
      if (rows?.length) await table.bulkAdd(rows);
    }
  });
}

function checkFile(file: ExportFile): void {
  if (!file || typeof file !== 'object' || file.format !== EXPORT_FORMAT) {
    throw new ImportError('not-weekbeat', 'Not a Weekbeat export file');
  }
  if (!isSupportedVersion(file.version)) {
    throw new ImportError('too-new', `Export version ${String(file.version)} is not supported by this app`);
  }
  if (!file.tables || typeof file.tables !== 'object' || Array.isArray(file.tables)) {
    throw new ImportError('not-weekbeat', 'Not a Weekbeat export file');
  }
  const allowed = new Set<string>(EXPORT_TABLES);
  const unknown = Object.keys(file.tables).filter((n) => !allowed.has(n));
  if (unknown.length) throw new ImportError('bad-table', `Unknown tables in export: ${unknown.join(', ')}`);
  for (const [name, rows] of Object.entries(file.tables)) {
    if (!Array.isArray(rows)) throw new ImportError('bad-table', `Table ${name} is not a list`);
    const problem = validateRows(name, rows);
    if (problem) throw new ImportError('bad-table', problem);
  }
}

export class ImportError extends Error {
  constructor(
    public readonly reason: 'not-json' | 'not-weekbeat' | 'too-new' | 'bad-table',
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Parses and checks an export file's text before anything is written. */
export function parseExportFile(text: string): ExportFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('not-json', 'File is not valid JSON');
  }
  checkFile(data as ExportFile);
  return data as ExportFile;
}

/** File name for an export, e.g. weekbeat-2026-11-22.json (local date). */
export function exportFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `weekbeat-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
