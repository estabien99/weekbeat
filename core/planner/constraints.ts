import { intensityOf } from '../knowledge.ts';
import type {
  ActivityType,
  Intensity,
  IntensityThresholdsData,
  IsoDate,
  KnowledgeRule,
  Place,
  RecoveryData,
} from '../model/types.ts';
import { DAY_MIN, dayIndexOf, hhmmToMin, overlaps } from './time.ts';
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
];

/** The first hard constraint a candidate breaks, or null if it passes all. */
export function rejectionOf(c: Candidate, ctx: ConstraintContext): Rejection | null {
  for (const [reason, check] of CHECKS) if (!check(c, ctx)) return reason;
  return null;
}
