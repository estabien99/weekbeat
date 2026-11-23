import { describe, expect, it } from 'vitest';
import { activityCatalogue, knowledgeRules } from '../../knowledge/index.ts';
import type { LoggedActivity, PlannedSession, Profile } from '../model/types.ts';
import { levelOf, xpForLevel } from './level.ts';
import { type GameInput, gameState } from './state.ts';

// Weeks start on Mondays: 2026-11-09, 2026-11-16, 2026-11-23 (date -d … +%A).
const TODAY = '2026-11-25';

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

let n = 0;
const log = (start: string, over: Partial<LoggedActivity> = {}): LoggedActivity => ({
  id: `l${++n}`,
  profileId: 'p',
  activityTypeId: 'weight-training', // 3.5 MET: moderate
  start,
  durationMin: 45,
  source: 'manual',
  ...over,
});

const input = (over: Partial<GameInput> = {}): GameInput => ({
  profile: profile(),
  logs: [],
  planned: [],
  catalogue: activityCatalogue,
  rules: knowledgeRules,
  today: TODAY,
  ...over,
});

const week = (s: ReturnType<typeof gameState>, start: string) => s!.weeks.find((w) => w.weekStart === start)!;

describe('gameState', () => {
  it('is off when the person or the household switched the game off', () => {
    expect(gameState(input({ profile: profile({ game: { enabled: false } }) }))).toBeNull();
    expect(gameState(input({ gameMode: 'off' }))).toBeNull();
    expect(gameState(input({ gameMode: 'solo' }))).not.toBeNull();
  });

  it('starts at level 1 with an open week and no streak', () => {
    const s = gameState(input())!;
    expect(s.weeks.map((w) => w.status)).toEqual(['open']);
    expect(s).toMatchObject({ streak: 0, bestStreak: 0, xp: 0, level: 1, nextLevelXp: 500 });
  });

  it('gives base XP by minutes and intensity band', () => {
    const s = gameState(
      input({
        logs: [
          log('2026-11-23T18:00'), // moderate: 45 × 2
          log('2026-11-24T18:00', { activityTypeId: 'yoga', durationMin: 30 }), // light: 30 × 1
        ],
        profile: profile({ goals: [{ kind: 'sessions', target: 3 }] }),
      }),
    )!;
    expect(s.events.filter((e) => e.reason === 'base').map((e) => e.xp)).toEqual([90, 30]);
  });

  it('counts the week goal and gives no credit beyond the weekly maximum', () => {
    const logs = ['23', '24', '25'].map((d) => log(`2026-11-${d}T18:00`));
    const s = gameState(input({ logs }))!;
    const w = week(s, '2026-11-23');
    expect(w.status).toBe('met');
    expect(w.counted).toHaveLength(2);
    expect(w.goals[0]).toMatchObject({ done: 2, reached: true });
    expect(s.events.some((e) => e.loggedActivityId === logs[2]!.id)).toBe(false);

    // The person's own game maximum replaces the goal as the cap.
    const more = gameState(input({ logs, profile: profile({ game: { enabled: true, weeklyMaxSessions: 3 } }) }))!;
    expect(week(more, '2026-11-23').counted).toHaveLength(3);
  });

  it('caps minutes goals at the minutes target (the session that reaches it counts)', () => {
    const logs = ['23', '24', '25'].map((d) => log(`2026-11-${d}T18:00`, { durationMin: 60 }));
    const s = gameState(input({ logs, profile: profile({ goals: [{ kind: 'minutes', target: 90 }] }) }))!;
    const w = week(s, '2026-11-23');
    expect(w.counted).toHaveLength(2);
    expect(w.goals[0]).toMatchObject({ done: 120, reached: true });
  });

  it('counts only matching categories toward a category goal', () => {
    const logs = [log('2026-11-23T18:00'), log('2026-11-24T18:00', { activityTypeId: 'yoga' })];
    const s = gameState(
      input({
        logs,
        profile: profile({
          goals: [
            { kind: 'sessions', target: 2 },
            { kind: 'sessions', target: 2, categories: ['strength'] },
          ],
        }),
      }),
    )!;
    expect(week(s, '2026-11-23').goals.map((g) => g.done)).toEqual([2, 1]);
    expect(week(s, '2026-11-23').status).toBe('open');
  });

  it('counts week streaks: running weeks never break them, a missed week restarts quietly, the best stays', () => {
    const logs = [
      log('2026-11-02T18:00'),
      log('2026-11-03T18:00'), // met
      log('2026-11-10T18:00'), // missed (1 of 2)
      log('2026-11-16T18:00'),
      log('2026-11-17T18:00'), // met
      log('2026-11-23T18:00'), // running
    ];
    const s = gameState(input({ logs }))!;
    expect(s.weeks.map((w) => w.status)).toEqual(['met', 'missed', 'met', 'open']);
    expect(s).toMatchObject({ streak: 1, bestStreak: 1 });

    const twoInARow = gameState(input({ logs: [...logs, log('2026-11-11T18:00')] }))!;
    expect(twoInARow).toMatchObject({ streak: 3, bestStreak: 3 });
  });

  it('pause freezes the streak and paused days earn nothing', () => {
    const logs = [
      log('2026-11-02T18:00'),
      log('2026-11-03T18:00'), // met
      log('2026-11-10T18:00'), // paused day: not counted, no XP
      log('2026-11-16T18:00'),
      log('2026-11-17T18:00'), // met
    ];
    const s = gameState(input({ logs, profile: profile({ pauses: [{ from: '2026-11-09', to: '2026-11-12' }] }) }))!;
    expect(s.weeks.map((w) => w.status)).toEqual(['met', 'paused', 'met', 'open']);
    expect(s.streak).toBe(2);
    expect(s.events.some((e) => e.loggedActivityId === logs[2]!.id)).toBe(false);
  });

  it('treats the current pause (pausedUntil) as paused from today', () => {
    const s = gameState(input({ profile: profile({ pausedUntil: '2026-11-30' }) }))!;
    expect(week(s, '2026-11-23').status).toBe('paused');
    // A pause that ended before today no longer counts without a recorded period.
    const ended = gameState(input({ profile: profile({ pausedUntil: '2026-11-20' }) }))!;
    expect(week(ended, '2026-11-23').status).toBe('open');
  });

  it('gives combo, together, variety and complement bonuses once each', () => {
    const coach: PlannedSession = {
      id: 'c1',
      profileId: 'p',
      activityTypeId: 'weight-training',
      programmeId: 'prog',
      start: '2026-11-23T18:00',
      durationMin: 45,
      why: { de: '', en: '' },
      status: 'done',
      withProfileIds: ['q'],
    };
    const visit = log('2026-11-23T18:00', { placeId: 'gym', source: 'checkin:wellpass' });
    const workout = log('2026-11-23T18:05', { mergedIntoId: visit.id, plannedSessionId: 'c1' });
    const run = log('2026-11-24T07:00', { activityTypeId: 'jogging', durationMin: 30 }); // vigorous, medium impact
    const s = gameState(
      input({
        logs: [visit, workout, run],
        planned: [coach],
        profile: profile({ hobbies: ['cycling'], goals: [{ kind: 'sessions', target: 3 }] }),
      }),
    )!;
    const reasons = (id: string) => s.events.filter((e) => e.loggedActivityId === id).map((e) => e.reason);
    expect(reasons(visit.id)).toEqual(['base', 'combo', 'together']);
    expect(reasons(run.id)).toEqual(['base', 'variety', 'complement']);
    expect(s.xp).toBe(90 + 20 + 20 + 90 + 20 + 20);
    expect(week(s, '2026-11-23').counted).toHaveLength(2); // merged logs count once
  });

  it('ignores other people and is deterministic', () => {
    const logs = [log('2026-11-23T18:00'), log('2026-11-24T18:00', { profileId: 'q' })];
    const a = gameState(input({ logs }))!;
    expect(week(a, '2026-11-23').counted).toHaveLength(1);
    expect(gameState(input({ logs }))).toEqual(a);
  });
});

describe('levels', () => {
  it('start at 1 and need 500, 1500, 3000 … XP', () => {
    expect([1, 2, 3, 4].map((l) => xpForLevel(l))).toEqual([0, 500, 1500, 3000]);
    expect([0, 499, 500, 1499, 1500, 3000].map((x) => levelOf(x))).toEqual([1, 1, 2, 2, 3, 4]);
  });

  it('gives nothing for training through an open health check, and goes on once cleared', () => {
    const logs = [log('2026-11-17T18:00'), log('2026-11-18T18:00'), log('2026-11-23T18:00')];
    const held = gameState(input({ logs, profile: profile({ health: { checkedOn: '2026-11-18', flagged: true } }) }))!;
    expect(held.events.map((e) => e.loggedActivityId)).toEqual([logs[0]!.id]);
    expect(week(held, '2026-11-16').status).toBe('paused');
    expect(week(held, '2026-11-23').status).toBe('paused');

    // Cleared on 23.11.: the hold is recorded as a pause up to the day before, Monday's session counts.
    const cleared = gameState(
      input({
        logs,
        profile: profile({
          health: { checkedOn: '2026-11-18', flagged: true, clearedOn: '2026-11-23' },
          pauses: [{ from: '2026-11-18', to: '2026-11-22' }],
        }),
      }),
    )!;
    expect(cleared.events.filter((e) => e.reason === 'base').map((e) => e.loggedActivityId)).toEqual([
      logs[0]!.id,
      logs[2]!.id,
    ]);
  });

  it('gives a recovery bonus once a week for a passed rest day without training, never toward the goal', () => {
    const s = gameState(
      input({
        logs: [log('2026-11-17T18:00')],
        profile: profile({ restDays: ['2026-11-18', '2026-11-19', '2026-11-17', '2026-11-24', '2026-11-26'] }),
      }),
    )!;
    const recovery = s.events.filter((e) => e.reason === 'recovery');
    // 17.11. had training; 18.11. is the week's one bonus; 24.11. has passed; 26.11. has not.
    expect(recovery.map((e) => e.id)).toEqual(['rest:2026-11-18', 'rest:2026-11-24']);
    expect(recovery.every((e) => e.xp === 20)).toBe(true);
    expect(week(s, '2026-11-16').goals[0]).toMatchObject({ done: 1, reached: false });
    expect(week(s, '2026-11-16').status).toBe('missed');
  });

  it('gives no recovery bonus on paused days', () => {
    const s = gameState(
      input({ profile: profile({ restDays: ['2026-11-18'], pauses: [{ from: '2026-11-16', to: '2026-11-20' }] }) }),
    )!;
    expect(s.events).toEqual([]);
  });
});
