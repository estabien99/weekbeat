import { intensityOf } from '../knowledge.ts';
import type {
  ActivityType,
  Intensity,
  IntensityThresholdsData,
  IsoDate,
  KnowledgeRule,
  Membership,
  Place,
  RecoveryData,
} from '../model/types.ts';
import { DAY_MIN, dateOfDay, dayIndexOf, hhmmToMin, overlaps } from './time.ts';
import type { Candidate, Rejection } from './types.ts';
import { type Done, type ProfileWeek, endOf, occupied, pausedThroughDay } from './week.ts';

/** Step 2, hard constraints: each check passes or names its reason. A candidate must pass all of them. */

export interface ConstraintContext {
  week: ProfileWeek;
  weekStart: IsoDate;
  /** Week minute before which nothing is planned (from PlanInput.notBefore). */
  notBefore?: number;
  recovery: RecoveryData[];
  /** Present when the knowledge base has an intensity rule (needed only by recovery rules). */
  thresholds?: IntensityThresholdsData;
}

export function recoveryContext(rules: readonly KnowledgeRule[]): Pick<ConstraintContext, 'recovery' | 'thresholds'> {
  const recovery = rules.flatMap((r) => (r.part === 'recovery' ? [r.data] : []));
  const intensity = rules.find((r) => r.part === 'intensity');
  return { recovery, thresholds: intensity?.part === 'intensity' ? intensity.data : undefined };
}

/** Whether an activity can happen at a place (indoor/outdoor setting and the place's categories). */
export function placeFits(activity: ActivityType, place: Place | undefined): boolean {
  if (!place) return activity.setting !== 'indoor';
  const settingOk = place.kind === 'outdoor' ? activity.setting !== 'indoor' : activity.setting !== 'outdoor';
  const categoryOk =
    place.categories.length === 0 ||
    place.categories.includes(activity.category) ||
    place.categories.includes(activity.id);
  return settingOk && categoryOk;
}

/** Nothing is planned in the past. */
export function notPast(c: Candidate, ctx: ConstraintContext): boolean {
  return ctx.notBefore === undefined || c.start >= ctx.notBefore;
}

/** What the person let go, missed or moved is not proposed again in the same slot. */
export function notDeclined(c: Candidate, ctx: ConstraintContext): boolean {
  return !ctx.week.declined.some((d) => d.activityId === c.activity.id && d.start === c.start);
}

export function notPaused(c: Candidate, ctx: ConstraintContext): boolean {
  const through = pausedThroughDay(ctx.week.profile, ctx.weekStart);
  return through === undefined || dayIndexOf(c.start) > through;
}

/** The session, travel included, lies inside one availability window. */
export function insideWindow(c: Candidate, ctx: ConstraintContext): boolean {
  const o = occupied({ ...c, travelMin: c.place?.travelMin ?? 0 });
  return ctx.week.windows.some((w) => w.start <= o.start && o.end <= w.end);
}

/** No overlap with calendar busy blocks or the person's other sessions (travel included on both sides). */
export function noOverlap(c: Candidate, ctx: ConstraintContext): boolean {
  const o = occupied({ ...c, travelMin: c.place?.travelMin ?? 0 });
  return !ctx.week.busy.some((b) => overlaps(o, b)) && !ctx.week.done.some((d) => overlaps(o, occupied(d)));
}

/** The place is open for the whole session. Places without opening hours count as always open. */
export function open(c: Candidate): boolean {
  const hours = c.place?.openingHours;
  if (!hours) return true;
  const day = dayIndexOf(c.start);
  const from = c.start - day * DAY_MIN;
  return hours.some((h) => h.day === day + 1 && hhmmToMin(h.from) <= from && from + c.durationMin <= hhmmToMin(h.to));
}

/** Every piece of equipment the session needs is at the place. */
export function hasEquipment(c: Candidate): boolean {
  const there = c.place?.equipment ?? [];
  return c.equipment.every((e) => there.includes(e));
}

/** A programme's sessions go on separate days ("days per week"). */
export function programmeDay(c: Candidate, ctx: ConstraintContext): boolean {
  if (!c.programme) return true;
  const day = dayIndexOf(c.start);
  return !ctx.week.done.some((d) => d.programmeId === c.programme!.id && dayIndexOf(d.start) === day);
}

export function settingFits(c: Candidate): boolean {
  return placeFits(c.activity, c.place);
}

const RANK: Record<Intensity, number> = { sedentary: 0, light: 1, moderate: 2, vigorous: 3 };

function recoveryApplies(rule: RecoveryData, activity: ActivityType | undefined, t: IntensityThresholdsData): boolean {
  if (!activity) return false;
  if (rule.forCategories && !rule.forCategories.includes(activity.category)) return false;
  return RANK[intensityOf(activity.met, t)] >= RANK[rule.afterIntensity];
}

/** Recovery gaps from `recovery` rules in the knowledge base. Without such a rule the check is inactive. */
export function recoveryGap(c: Candidate, ctx: ConstraintContext): boolean {
  const t = ctx.thresholds;
  if (!t) return true;
  const self: Done = { activity: c.activity, start: c.start, durationMin: c.durationMin, travelMin: 0 };
  for (const rule of ctx.recovery) {
    if (!recoveryApplies(rule, c.activity, t)) continue;
    const gap = rule.minHours * 60;
    for (const d of [...ctx.week.past, ...ctx.week.done]) {
      if (!recoveryApplies(rule, d.activity, t)) continue;
      const [first, second] = d.start <= self.start ? [d, self] : [self, d];
      if (second.start - endOf(first) < gap) return false;
    }
  }
  return true;
}

/** Local date (YYYY-MM-DD) of a week minute; minutes before the week give earlier dates. */
export function dateAt(weekStart: IsoDate, minute: number): IsoDate {
  return dateOfDay(weekStart, dayIndexOf(minute));
}

/** Visits (sessions and logs with a place) of the week and before it, in week minutes. */
export function visits(week: ProfileWeek): Done[] {
  return [...week.past, ...week.done].filter((d) => d.placeId !== undefined);
}

/** Visits through membership `m` (at places it covers) on the date or in the month of `date`. */
export function usage(
  week: ProfileWeek,
  weekStart: IsoDate,
  m: Membership,
  date: IsoDate,
): { day: number; month: number } {
  let day = 0;
  let month = 0;
  for (const v of visits(week)) {
    if (!week.places.get(v.placeId!)?.membershipIds.includes(m.id)) continue;
    const d = dateAt(weekStart, v.start);
    if (d.slice(0, 7) === date.slice(0, 7)) month++;
    if (d === date) day++;
  }
  return { day, month };
}

/** The monthly check-in limit of `m` that applies on `date`, if any. */
export function monthlyLimit(m: Membership, date: IsoDate): number | undefined {
  if (m.monthlyCheckInLimit === undefined) return undefined;
  return m.monthlyCheckInLimitFrom && date < m.monthlyCheckInLimitFrom ? undefined : m.monthlyCheckInLimit;
}

/**
 * A visit to a place the person reaches through a membership stays within that membership's daily and monthly
 * check-in limits and the venue's own monthly limit. Places no membership of the person covers are not limited.
 */
export function withinCheckInLimits(c: Candidate, ctx: ConstraintContext): boolean {
  const place = c.place;
  if (!place) return true;
  const covering = ctx.week.memberships.filter((m) => place.membershipIds.includes(m.id));
  if (covering.length === 0) return true;
  const date = dateAt(ctx.weekStart, c.start);
  if (place.monthlyVisitLimit !== undefined) {
    const atPlace = visits(ctx.week).filter(
      (v) => v.placeId === place.id && dateAt(ctx.weekStart, v.start).slice(0, 7) === date.slice(0, 7),
    ).length;
    if (atPlace >= place.monthlyVisitLimit) return false;
  }
  return covering.some((m) => {
    const used = usage(ctx.week, ctx.weekStart, m, date);
    const perMonth = monthlyLimit(m, date);
    return (
      (m.dailyCheckInLimit === undefined || used.day < m.dailyCheckInLimit) &&
      (perMonth === undefined || used.month < perMonth)
    );
  });
}

const CHECKS: [Rejection, (c: Candidate, ctx: ConstraintContext) => boolean][] = [
  ['past', notPast],
  ['declined', notDeclined],
  ['paused', notPaused],
  ['setting', settingFits],
  ['equipment', hasEquipment],
  ['outside-window', insideWindow],
  ['overlap', noOverlap],
  ['closed', open],
  ['programme-day', programmeDay],
  ['recovery', recoveryGap],
  ['check-in-limit', withinCheckInLimits],
];

/** The first hard constraint a candidate breaks, or null if it passes all. */
export function rejectionOf(c: Candidate, ctx: ConstraintContext): Rejection | null {
  for (const [reason, check] of CHECKS) if (!check(c, ctx)) return reason;
  return null;
}
