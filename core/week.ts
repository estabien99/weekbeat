import type { IsoDate, Weekday } from './model/types.ts';

/** Local date as YYYY-MM-DD (no UTC shift). */
export function toIsoDate(d: Date): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(d: Date): Weekday {
  return (((d.getDay() + 6) % 7) + 1) as Weekday;
}

/** The seven local dates (Monday first) of the week that contains `d`. */
export function weekOf(d: Date): Date[] {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (isoWeekday(d) - 1));
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

/** ISO 8601 week number and week-based year. */
export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}
