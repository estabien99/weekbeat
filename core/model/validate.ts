/**
 * Strict row validation for data that comes from outside the app (import files). Every table has a schema;
 * unknown fields, wrong types, unknown enum values and non-https URLs are rejected. Small on purpose: no
 * dependency, and the schemas sit next to the model they check.
 */

type Check = (v: unknown, path: string) => string | null;

const ok = null;
const fail = (path: string, what: string) => `${path}: ${what}`;

const str: Check = (v, p) => (typeof v === 'string' ? ok : fail(p, 'expected text'));
const nonEmpty: Check = (v, p) => (typeof v === 'string' && v.trim() !== '' ? ok : fail(p, 'expected non-empty text'));
const num: Check = (v, p) => (typeof v === 'number' && Number.isFinite(v) ? ok : fail(p, 'expected a number'));
const positive: Check = (v, p) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? ok : fail(p, 'expected a positive number');
const bool: Check = (v, p) => (typeof v === 'boolean' ? ok : fail(p, 'expected true/false'));
const pattern =
  (re: RegExp, what: string): Check =>
  (v, p) =>
    typeof v === 'string' && re.test(v) ? ok : fail(p, what);
const isoDate = pattern(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const isoDateTime = pattern(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/,
  'expected a date-time',
);
const hhmm = pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm');

/** Only https links may be stored: blocks javascript:, data: and plain-http URLs. */
export const httpsUrl: Check = (v, p) => {
  if (typeof v !== 'string') return fail(p, 'expected a URL');
  try {
    return new URL(v).protocol === 'https:' ? ok : fail(p, 'only https links are allowed');
  } catch {
    return fail(p, 'expected a URL');
  }
};

const oneOf =
  (...values: (string | number)[]): Check =>
  (v, p) =>
    values.includes(v as string | number) ? ok : fail(p, `expected one of ${values.join(', ')}`);

const arr =
  (item: Check): Check =>
  (v, p) => {
    if (!Array.isArray(v)) return fail(p, 'expected a list');
    for (const [i, x] of v.entries()) {
      const e = item(x, `${p}[${i}]`);
      if (e) return e;
    }
    return ok;
  };

const OPTIONAL = Symbol('optional');
type Field = Check | { [OPTIONAL]: Check };
const opt = (c: Check): Field => ({ [OPTIONAL]: c });

const obj =
  (shape: Record<string, Field>): Check =>
  (v, p) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(p, 'expected an object');
    const rec = v as Record<string, unknown>;
    for (const key of Object.keys(rec)) if (!(key in shape)) return fail(`${p}.${key}`, 'unknown field');
    for (const [key, field] of Object.entries(shape)) {
      const optional = typeof field === 'object';
      const check = optional ? field[OPTIONAL] : field;
      if (rec[key] === undefined) {
        if (optional) continue;
        return fail(`${p}.${key}`, 'missing');
      }
      const e = check(rec[key], `${p}.${key}`);
      if (e) return e;
    }
    return ok;
  };

const text = obj({ de: str, en: str });
const goal = obj({ kind: oneOf('sessions', 'minutes'), target: num, categories: opt(arr(str)) });
const weekday = oneOf(1, 2, 3, 4, 5, 6, 7);
const source = obj({ title: str, url: httpsUrl });
const confidence = oneOf('low', 'medium', 'high');

/** One schema per exported table. Keep in sync with core/model/types.ts (db.test.ts checks the table list). */
export const TABLE_SCHEMAS: Record<string, Check> = {
  households: obj({
    id: nonEmpty,
    name: str,
    memberIds: arr(nonEmpty),
    sharedGoals: arr(goal),
    gameMode: oneOf('off', 'solo', 'cooperative', 'competitive'),
  }),
  profiles: obj({
    id: nonEmpty,
    householdId: nonEmpty,
    name: str,
    lang: oneOf('de', 'en'),
    level: oneOf('beginner', 'intermediate', 'advanced'),
    goals: arr(goal),
    hobbies: arr(nonEmpty),
    limitations: arr(obj({ tag: str, note: opt(str) })),
    game: obj({ enabled: bool, weeklyMaxSessions: opt(num) }),
    preferredSessionMin: opt(positive),
    autoPlan: opt(bool),
    pausedUntil: opt(isoDate),
  }),
  activityTypes: obj({
    id: nonEmpty,
    name: text,
    category: oneOf('cycling', 'strength', 'hiit', 'mobility', 'endurance', 'swimming'),
    met: num,
    compendium: opt(obj({ code: str, met: num, description: str })),
    setting: oneOf('indoor', 'outdoor', 'both'),
    muscleGroups: opt(arr(str)),
    impact: opt(oneOf('low', 'medium', 'high')),
    mapping: obj({
      healthConnect: opt(str),
      healthKit: opt(str),
      fit: opt(obj({ sport: str, subSport: str })),
    }),
    mappingNote: opt(str),
    sources: opt(arr(source)),
    confidence: opt(confidence),
    lastReviewed: opt(isoDate),
  }),
  programmes: obj({
    id: nonEmpty,
    profileId: nonEmpty,
    name: str,
    connectorId: opt(str),
    daysPerWeek: num,
    typicalSessions: arr(obj({ activityTypeId: nonEmpty, durationMin: positive, equipment: arr(str) })),
  }),
  memberships: obj({
    id: nonEmpty,
    provider: str,
    tier: opt(str),
    ownerProfileId: nonEmpty,
    linkedToMembershipId: opt(nonEmpty),
    monthlyCostShareEur: opt(num),
  }),
  places: obj({
    id: nonEmpty,
    name: str,
    kind: oneOf('partner', 'own', 'outdoor', 'home'),
    membershipIds: arr(nonEmpty),
    address: opt(str),
    categories: arr(str),
    equipment: arr(str),
    openingHours: opt(arr(obj({ day: weekday, from: hhmm, to: hhmm }))),
    bookingUrl: opt(httpsUrl),
    singleVisitPriceEur: opt(num),
    travelMin: opt(num),
  }),
  availability: obj({
    id: nonEmpty,
    profileId: nonEmpty,
    windows: arr(obj({ day: weekday, from: hhmm, to: hhmm })),
    busy: arr(obj({ start: isoDateTime, end: isoDateTime, source: str })),
  }),
  plannedSessions: obj({
    id: nonEmpty,
    profileId: nonEmpty,
    activityTypeId: nonEmpty,
    placeId: opt(nonEmpty),
    programmeId: opt(nonEmpty),
    start: isoDateTime,
    durationMin: num,
    why: text,
    status: oneOf('proposed', 'accepted', 'done', 'missed', 'moved', 'skipped'),
    withProfileIds: opt(arr(nonEmpty)),
  }),
  loggedActivities: obj({
    id: nonEmpty,
    profileId: nonEmpty,
    activityTypeId: nonEmpty,
    start: isoDateTime,
    durationMin: num,
    source: str,
    sourceRef: opt(str),
    load: opt(num),
    plannedSessionId: opt(nonEmpty),
    mergedIntoId: opt(nonEmpty),
  }),
  quests: obj({
    id: nonEmpty,
    profileId: opt(nonEmpty),
    householdId: opt(nonEmpty),
    title: text,
    from: isoDate,
    to: isoDate,
    target: num,
    progress: num,
    ruleId: opt(nonEmpty),
  }),
  badges: obj({ id: nonEmpty, profileId: nonEmpty, key: str, earnedAt: isoDateTime }),
  xpEvents: obj({
    id: nonEmpty,
    profileId: nonEmpty,
    loggedActivityId: opt(nonEmpty),
    at: isoDateTime,
    xp: num,
    reason: str,
  }),
};

/** First problem in a table's rows, or null. */
export function validateRows(table: string, rows: unknown[]): string | null {
  const schema = TABLE_SCHEMAS[table];
  if (!schema) return `${table}: unknown table`;
  for (const [i, row] of rows.entries()) {
    const e = schema(row, `${table}[${i}]`);
    if (e) return e;
  }
  return null;
}
