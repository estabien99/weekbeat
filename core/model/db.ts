import Dexie, { type EntityTable } from 'dexie';
import type {
  ActivityType, Availability, Badge, Household, LoggedActivity, Membership, Place,
  PlannedSession, Profile, Programme, Quest, XPEvent,
} from './types.ts';

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

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

/** Whole database as one JSON-serialisable object (export/import principle). */
export async function exportAll(db: WeekbeatDB): Promise<ExportFile> {
  const tables: Record<string, unknown[]> = {};
  for (const table of db.tables) tables[table.name] = await table.toArray();
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), tables };
}

/** Replaces all data with an export file. Unknown tables are rejected, not silently dropped. */
export async function importAll(db: WeekbeatDB, file: ExportFile): Promise<void> {
  if (file.format !== EXPORT_FORMAT) throw new Error('Not a Weekbeat export file');
  if (file.version > EXPORT_VERSION) throw new Error(`Export version ${file.version} is newer than this app`);
  const known = new Set(db.tables.map((t) => t.name));
  const unknown = Object.keys(file.tables).filter((n) => !known.has(n));
  if (unknown.length) throw new Error(`Unknown tables in export: ${unknown.join(', ')}`);
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const rows = file.tables[table.name];
      if (rows?.length) await table.bulkAdd(rows);
    }
  });
}
