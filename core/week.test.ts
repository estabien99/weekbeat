import { describe, expect, it } from 'vitest';
import { isoWeek, isoWeekday, toIsoDate, weekOf } from './week.ts';

describe('week helpers', () => {
  it('starts the week on Monday', () => {
    // Sunday 22 Nov 2026
    const days = weekOf(new Date(2026, 10, 22)).map(toIsoDate);
    expect(days[0]).toBe('2026-11-16');
    expect(days[6]).toBe('2026-11-22');
  });

  it('maps weekdays to ISO numbers', () => {
    expect(isoWeekday(new Date(2026, 10, 16))).toBe(1);
    expect(isoWeekday(new Date(2026, 10, 22))).toBe(7);
  });

  it('computes ISO week numbers across year boundaries', () => {
    expect(isoWeek(new Date(2026, 10, 22))).toEqual({ year: 2026, week: 47 });
    expect(isoWeek(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(new Date(2024, 11, 30))).toEqual({ year: 2025, week: 1 });
  });
});
