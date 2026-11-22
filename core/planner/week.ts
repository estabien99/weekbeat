import type { ActivityType, Id, IsoDate, Membership, Place, Profile } from '../model/types.ts';
import { DAY_MIN, type Interval, hhmmToMin, minuteOfWeek } from './time.ts';
import type { Candidate, PlanInput } from './types.ts';

/** A session that already happened or is fixed this week (anchor, log, or a pick of this run). */
export interface Done {
  /** Undefined when the id is not in the catalogue: it still blocks time and counts as a session. */
  activity?: ActivityType;
  start: number;
  durationMin: number;
  travelMin: number;
  programmeId?: Id;
  /** Where it happens or happened: visits count toward check-in limits. */
  placeId?: Id;
}

/** One person's week as the planner sees it, in week minutes. */
export interface ProfileWeek {
  profile: Profile;
  windows: Interval[];
  busy: Interval[];
  /** This week. */
  done: Done[];
  /** Logs before this week (recovery gaps, deload). */
  past: Done[];
  membershipIds: Set<Id>;
  /** The person's own memberships (check-in limits). */
  memberships: Membership[];
  places: Map<Id, Place>;
  /** Sessions the person let go, missed or moved this week: never proposed again at the same time. */
  declined: { activityId: Id; start: number }[];
}

/** Session statuses that block time and count toward goals. */
export const COUNTING: ReadonlySet<string> = new Set(['proposed', 'accepted', 'done']);

export function endOf(d: Pick<Done, 'start' | 'durationMin'>): number {
  return d.start + d.durationMin;
}

/** Time a session takes out of the day, travel there and back included. */
export function occupied(d: Pick<Done, 'start' | 'durationMin' | 'travelMin'>): Interval {
  return { start: d.start - d.travelMin, end: d.start + d.durationMin + d.travelMin };
}

export function buildWeek(profile: Profile, input: PlanInput): ProfileWeek {
  const { weekStart } = input;
  const byId = new Map(input.catalogue.map((a) => [a.id, a]));
  const travel = new Map(input.places.map((p) => [p.id, p.travelMin ?? 0]));
  const avail = input.availability.filter((a) => a.profileId === profile.id);

  const windows = avail
    .flatMap((a) => a.windows)
    .map((w) => ({ start: (w.day - 1) * DAY_MIN + hhmmToMin(w.from), end: (w.day - 1) * DAY_MIN + hhmmToMin(w.to) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const busy = avail
    .flatMap((a) => a.busy)
    .map((b) => ({ start: minuteOfWeek(b.start, weekStart), end: minuteOfWeek(b.end, weekStart) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  // The app passes every saved session; only this week's count toward this week (and block its time).
  const thisWeek = (iso: string) => {
    const m = minuteOfWeek(iso, weekStart);
    return m >= 0 && m < 7 * DAY_MIN;
  };
  const anchors = input.anchors.filter(
    (s) => s.profileId === profile.id && COUNTING.has(s.status) && thisWeek(s.start),
  );
  const anchorIds = new Set(anchors.map((s) => s.id));
  const fromAnchors: Done[] = anchors.map((s) => ({
    activity: byId.get(s.activityTypeId),
    start: minuteOfWeek(s.start, weekStart),
    durationMin: s.durationMin,
    travelMin: s.placeId ? (travel.get(s.placeId) ?? 0) : 0,
    programmeId: s.programmeId,
    placeId: s.placeId,
  }));
  // A log of a planned anchor is the same session; merged logs count through the session they were merged into.
  const logs: Done[] = input.logs
    .filter((l) => l.profileId === profile.id && !l.mergedIntoId)
    .filter((l) => !(l.plannedSessionId && anchorIds.has(l.plannedSessionId)))
    .map((l) => ({
      activity: byId.get(l.activityTypeId),
      start: minuteOfWeek(l.start, weekStart),
      durationMin: l.durationMin,
      travelMin: 0,
      placeId: l.placeId,
    }));
  const inWeek = (d: Done) => d.start >= 0 && d.start < 7 * DAY_MIN;
  const done = [...fromAnchors, ...logs.filter(inWeek)].sort((a, b) => a.start - b.start);
  const past = logs.filter((d) => d.start < 0).sort((a, b) => a.start - b.start);

  // Coverage is explicit: a linked membership (e.g. Plus 1) covers only the places that list it.
  const memberships = input.memberships.filter((m) => m.ownerProfileId === profile.id);
  const membershipIds = new Set(memberships.map((m) => m.id));
  const declined = input.anchors
    .filter((s) => s.profileId === profile.id && !COUNTING.has(s.status))
    .map((s) => ({ activityId: s.activityTypeId, start: minuteOfWeek(s.start, weekStart) }));
  const places = new Map(input.places.map((p) => [p.id, p]));
  return { profile, windows, busy, done, past, membershipIds, memberships, places, declined };
}

export function addPick(week: ProfileWeek, c: Candidate): void {
  week.done.push({
    activity: c.activity,
    start: c.start,
    durationMin: c.durationMin,
    travelMin: c.place?.travelMin ?? 0,
    programmeId: c.programme?.id,
    placeId: c.place?.id,
  });
  week.done.sort((a, b) => a.start - b.start);
}

/** Last day (0 = Monday, may be negative or ≥ 7) the person is paused, or undefined. */
export function pausedThroughDay(profile: Profile, weekStart: IsoDate): number | undefined {
  if (!profile.pausedUntil) return undefined;
  return Math.floor(minuteOfWeek(profile.pausedUntil, weekStart) / DAY_MIN);
}
