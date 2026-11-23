import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { WeekbeatDB } from './db.ts';
import { ValidationError, createHousehold } from './repo.ts';
import {
  clearHealthHold,
  endPause,
  healthChecked,
  healthCleared,
  healthHold,
  isPaused,
  pauseEnded,
  pauseUntil,
  restDayToggled,
  saveHealthCheck,
  setPause,
  toggleRestDay,
} from './health.ts';
import type { Profile } from './types.ts';

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'p',
  householdId: 'h',
  name: 'A',
  lang: 'de',
  level: 'beginner',
  goals: [{ kind: 'sessions', target: 2 }],
  hobbies: [],
  limitations: [],
  game: { enabled: true },
  ...over,
});

const TODAY = '2026-11-23';

describe('pause mode', () => {
  it('starts a pause and records it for the game', () => {
    expect(pauseUntil(profile(), TODAY, '2026-11-30')).toEqual({
      pausedUntil: '2026-11-30',
      pauses: [{ from: TODAY, to: '2026-11-30' }],
    });
  });

  it('moves the end of the running pause instead of adding one', () => {
    const p = profile({ pausedUntil: '2026-11-30', pauses: [{ from: '2026-11-20', to: '2026-11-30' }] });
    expect(pauseUntil(p, TODAY, '2026-12-06')).toEqual({
      pausedUntil: '2026-12-06',
      pauses: [{ from: '2026-11-20', to: '2026-12-06' }],
    });
  });

  it('keeps an ended pause and starts a new one', () => {
    const p = profile({ pausedUntil: '2026-11-10', pauses: [{ from: '2026-11-03', to: '2026-11-10' }] });
    expect(pauseUntil(p, TODAY, TODAY).pauses).toEqual([
      { from: '2026-11-03', to: '2026-11-10' },
      { from: TODAY, to: TODAY },
    ]);
  });

  it('rejects an end in the past', () => {
    expect(() => pauseUntil(profile(), TODAY, '2026-11-22')).toThrow(ValidationError);
    expect(() => pauseUntil(profile(), TODAY, 'tomorrow')).toThrow(ValidationError);
  });

  it('ends a pause early: kept up to yesterday, or dropped if it started today', () => {
    const p = profile({ pausedUntil: '2026-11-30', pauses: [{ from: '2026-11-20', to: '2026-11-30' }] });
    expect(pauseEnded(p, TODAY)).toEqual({
      pausedUntil: undefined,
      pauses: [{ from: '2026-11-20', to: '2026-11-22' }],
    });
    const fresh = profile({ pausedUntil: '2026-11-30', pauses: [{ from: TODAY, to: '2026-11-30' }] });
    expect(pauseEnded(fresh, TODAY)).toEqual({ pausedUntil: undefined, pauses: [] });
  });
});

describe('health self-check', () => {
  it('stores only the outcome; a yes holds the plan until cleared', () => {
    const checked = healthChecked(profile(), TODAY, true);
    expect(checked.health).toEqual({ checkedOn: TODAY, flagged: true });
    const held = profile(checked);
    expect(healthHold(held)).toBe(true);
    expect(isPaused(held, TODAY)).toBe(true);
    expect(healthHold(profile(healthChecked(profile(), TODAY, false)))).toBe(false);
  });

  it('records the hold as a pause up to the day before it is cleared', () => {
    const held = profile({ health: { checkedOn: '2026-11-18', flagged: true } });
    expect(healthCleared(held, TODAY)).toEqual({
      health: { checkedOn: '2026-11-18', flagged: true, clearedOn: TODAY },
      pauses: [{ from: '2026-11-18', to: '2026-11-22' }],
    });
    // Cleared on the day of the check: nothing to record.
    expect(healthCleared(profile({ health: { checkedOn: TODAY, flagged: true } }), TODAY).pauses).toEqual([]);
    expect(() => healthCleared(profile(), TODAY)).toThrow(ValidationError);
  });

  it('closes an open hold when the check is answered again', () => {
    const held = profile({ health: { checkedOn: '2026-11-18', flagged: true } });
    expect(healthChecked(held, TODAY, false)).toEqual({
      health: { checkedOn: TODAY, flagged: false },
      pauses: [{ from: '2026-11-18', to: '2026-11-22' }],
    });
  });
});

describe('rest days', () => {
  it('toggles a day, sorted and without duplicates', () => {
    const one = restDayToggled(profile({ restDays: ['2026-11-25'] }), '2026-11-24');
    expect(one.restDays).toEqual(['2026-11-24', '2026-11-25']);
    expect(restDayToggled(profile(one), '2026-11-24').restDays).toEqual(['2026-11-25']);
    expect(() => restDayToggled(profile(), '24.11.')).toThrow(ValidationError);
  });
});

describe('stored on the profile', () => {
  it('writes pause, check and rest days', async () => {
    const db = new WeekbeatDB(`test-${crypto.randomUUID()}`);
    try {
      const { profile: p } = await createHousehold(db, 'Nest', {
        name: 'A',
        lang: 'de',
        level: 'beginner',
        goal: { kind: 'sessions', target: 2 },
      });
      await setPause(db, p.id, TODAY, '2026-11-30');
      await endPause(db, p.id, '2026-11-25');
      await saveHealthCheck(db, p.id, TODAY, true);
      await clearHealthHold(db, p.id, '2026-11-26');
      await toggleRestDay(db, p.id, '2026-11-28');
      const stored = await db.profiles.get(p.id);
      expect(stored).toMatchObject({
        pauses: [
          { from: TODAY, to: '2026-11-24' },
          { from: TODAY, to: '2026-11-25' },
        ],
        health: { checkedOn: TODAY, flagged: true, clearedOn: '2026-11-26' },
        restDays: ['2026-11-28'],
      });
      expect(stored!.pausedUntil).toBeUndefined();
      await expect(setPause(db, 'nobody', TODAY, TODAY)).rejects.toThrow(ValidationError);
    } finally {
      await db.delete();
    }
  });
});
