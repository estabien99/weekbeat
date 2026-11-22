import { describe, expect, it } from 'vitest';
import { DAY_MIN, dateOfDay, hhmmToMin, isoAt, minuteOfWeek, overlaps, subtract } from './time.ts';

const MON = '2026-11-23';

describe('week minutes', () => {
  it('converts local date-times relative to Monday', () => {
    expect(minuteOfWeek('2026-11-23T00:00', MON)).toBe(0);
    expect(minuteOfWeek('2026-11-24T18:30', MON)).toBe(DAY_MIN + 18 * 60 + 30);
    expect(minuteOfWeek('2026-11-22T23:00', MON)).toBe(-60);
    expect(minuteOfWeek('2026-11-25', MON)).toBe(2 * DAY_MIN);
  });

  it('round-trips minutes to local date-times', () => {
    expect(isoAt(MON, 5 * DAY_MIN + 9 * 60)).toBe('2026-11-28T09:00');
    expect(dateOfDay(MON, 6)).toBe('2026-11-29');
    expect(dateOfDay(MON, 8)).toBe('2026-12-01');
    expect(hhmmToMin('07:45')).toBe(465);
  });

  it('subtracts blocks from an interval', () => {
    const free = subtract({ start: 0, end: 100 }, [
      { start: 10, end: 20 },
      { start: 50, end: 120 },
      { start: 200, end: 300 },
    ]);
    expect(free).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 50 },
    ]);
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
  });
});
