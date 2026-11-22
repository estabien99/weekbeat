import type { IsoDate, IsoDateTime } from '../model/types.ts';

/**
 * Week-relative time: the planner counts in minutes from Monday 00:00 local time of the planned week
 * (wall clock, so a DST change inside the week does not shift sessions). Values before 0 are earlier weeks.
 */

export const DAY_MIN = 24 * 60;
export const WEEK_MIN = 7 * DAY_MIN;

/** Half-open interval [start, end) in week minutes. */
export interface Interval {
  start: number;
  end: number;
}

export function hhmmToMin(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function localMidnight(date: IsoDate): Date {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Minute of the week (relative to `weekStart`, a Monday) for a local or offset date-time. */
export function minuteOfWeek(iso: IsoDateTime, weekStart: IsoDate): number {
  // A bare date would be read as UTC by Date; treat it as local midnight instead.
  const t = iso.length === 10 ? localMidnight(iso) : new Date(iso);
  const day = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const days = Math.round((day.getTime() - localMidnight(weekStart).getTime()) / 86_400_000);
  return days * DAY_MIN + t.getHours() * 60 + t.getMinutes();
}

/** Local date of day `dayIndex` (0 = Monday) of the week. */
export function dateOfDay(weekStart: IsoDate, dayIndex: number): IsoDate {
  const d = localMidnight(weekStart);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayIndex);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** Local date-time (YYYY-MM-DDTHH:mm) of a minute inside the week. */
export function isoAt(weekStart: IsoDate, minute: number): IsoDateTime {
  const day = Math.floor(minute / DAY_MIN);
  const m = minute - day * DAY_MIN;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dateOfDay(weekStart, day)}T${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function dayIndexOf(minute: number): number {
  return Math.floor(minute / DAY_MIN);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** `outer` minus every block, as sorted, non-empty intervals. */
export function subtract(outer: Interval, blocks: readonly Interval[]): Interval[] {
  let free: Interval[] = [outer];
  for (const b of blocks) {
    free = free.flatMap((f) => {
      if (!overlaps(f, b)) return [f];
      const parts: Interval[] = [];
      if (b.start > f.start) parts.push({ start: f.start, end: b.start });
      if (b.end < f.end) parts.push({ start: b.end, end: f.end });
      return parts;
    });
  }
  return free.sort((x, y) => x.start - y.start);
}
