import { describe, expect, it } from 'vitest';
import { activityCatalogue, knowledgeRules } from '../../knowledge/index.ts';
import type { LoggedActivity, Profile } from '../model/types.ts';
import { householdGame } from './household.ts';
import { type GameInput, gameState } from './state.ts';

// Mondays: 2026-11-02, 09, 16, 23, 30 (date -d … +%A). Today is in November: the autumn quest runs.
const TODAY = '2026-11-25';

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'p',
  householdId: 'h',
  name: 'A',
  lang: 'de',
  level: 'beginner',
  goals: [{ kind: 'sessions', target: 3 }],
  hobbies: [],
  limitations: [],
  game: { enabled: true },
  ...over,
});

let n = 0;
const log = (
  start: string,
  activityTypeId = 'weight-training',
  over: Partial<LoggedActivity> = {},
): LoggedActivity => ({
  id: `l${++n}`,
  profileId: 'p',
  activityTypeId,
  start,
  durationMin: 45,
  source: 'manual',
  ...over,
});

const state = (over: Partial<GameInput> = {}) =>
  gameState({
    profile: profile(),
    logs: [],
    planned: [],
    catalogue: activityCatalogue,
    rules: knowledgeRules,
    today: TODAY,
    ...over,
  })!;

describe('badges', () => {
  it('awards firsts once, at the session that unlocked them', () => {
    const logs = [
      log('2026-11-23T18:00'),
      log('2026-11-24T18:00', 'yoga'),
      log('2026-11-25T07:00', 'jogging'), // third category this week
      log('2026-11-25T18:00', 'yoga', { profileId: 'q' }), // someone else
    ];
    const s = state({ logs });
    expect(s.badges.map((b) => [b.key, b.earnedAt])).toEqual([
      ['first-session', '2026-11-23T18:00'],
      ['first-category:strength', '2026-11-23T18:00'],
      ['first-category:mobility', '2026-11-24T18:00'],
      ['first-category:endurance', '2026-11-25T07:00'],
      ['variety-week', '2026-11-25T07:00'],
    ]);
  });

  it('counts only counted sessions toward milestones (nothing beyond the weekly maximum)', () => {
    const days = ['02', '03', '04', '05', '09', '10', '11', '12', '16', '17', '18', '19'];
    const logs = days.map((d) => log(`2026-11-${d}T18:00`));
    const s = state({ logs });
    // 3 counted per week: 9 sessions over the first three weeks, so no 10-session badge yet.
    expect(s.badges.some((b) => b.key === 'sessions:10')).toBe(false);
    const more = state({ logs: [...logs, log('2026-11-23T18:00')] });
    expect(more.badges.find((b) => b.key === 'sessions:10')?.earnedAt).toBe('2026-11-23T18:00');
  });

  it('awards a streak badge in the week the streak reaches it', () => {
    const weeks = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'];
    const logs = weeks.flatMap((w) =>
      [0, 1, 2].map((i) => log(`${w.slice(0, 8)}${String(Number(w.slice(8)) + i).padStart(2, '0')}T18:00`)),
    );
    const s = state({ logs });
    expect(s.badges.find((b) => b.key === 'streak:4')?.earnedAt).toBe('2026-11-04T18:00');
  });
});

describe('quests', () => {
  it("strength: weeks of this month with strength on the rule's number of days", () => {
    const logs = [log('2026-11-02T18:00'), log('2026-11-04T18:00'), log('2026-11-09T18:00')];
    const q = state({ logs }).quests.find((x) => x.key === 'strength')!;
    expect(q).toMatchObject({
      ruleId: 'who-weekly-targets-adults',
      from: '2026-11-01',
      to: '2026-11-30',
      target: 3,
      progress: 1,
      done: false,
    });
  });

  it('complement: only for hobbies a rule covers, counting sessions that fit it', () => {
    expect(state().quests.some((q) => q.key === 'complement')).toBe(false);
    const logs = [
      log('2026-11-03T07:00', 'jogging'),
      log('2026-11-04T18:00', 'cycling'),
      log('2026-10-30T07:00', 'jogging'),
    ];
    const q = state({ logs, profile: profile({ hobbies: ['cycling'] }) }).quests.find((x) => x.key === 'complement')!;
    expect(q).toMatchObject({ need: 'bone-loading', ruleId: 'complement-cycling-bone', target: 4, progress: 1 });
  });

  it('seasonal: the autumn quest counts different categories this month', () => {
    const logs = [log('2026-11-03T18:00'), log('2026-11-04T18:00', 'yoga'), log('2026-11-05T18:00', 'yoga')];
    expect(state({ logs }).quests.find((q) => q.key === 'autumn-mix')).toMatchObject({ target: 3, progress: 2 });
    const winter = state({ today: '2027-01-10', logs: [log('2027-01-05T18:00'), log('2027-01-06T07:00', 'jogging')] });
    expect(winter.quests.find((q) => q.key === 'winter-indoor')).toMatchObject({ progress: 1, to: '2027-01-31' });
  });
});

describe('householdGame', () => {
  const met = ['2026-11-16', '2026-11-17', '2026-11-18'];
  it('is only on in cooperative mode', () => {
    const a = state();
    expect(householdGame([{ profileId: 'p', state: a }], 'solo')).toBeNull();
    expect(householdGame([{ profileId: 'p', state: null }], 'cooperative')).toBeNull();
  });

  it('counts weeks in which everyone not paused met their own goal', () => {
    const a = state({ logs: met.map((d) => log(`${d}T18:00`)) });
    const bLogs = met.map((d) => log(`${d}T19:00`, 'yoga', { profileId: 'q' }));
    const b = state({ profile: profile({ id: 'q' }), logs: bLogs });
    expect(
      householdGame(
        [
          { profileId: 'p', state: a },
          { profileId: 'q', state: b },
        ],
        'cooperative',
      ),
    ).toEqual({
      members: 2,
      metThisWeek: 0,
      activeThisWeek: 2,
      streak: 1,
      bestStreak: 1,
    });
    // One person paused that week: the other one carries it.
    const paused = state({
      profile: profile({ id: 'q', pauses: [{ from: '2026-11-16', to: '2026-11-22' }] }),
      logs: [],
    });
    expect(
      householdGame(
        [
          { profileId: 'p', state: a },
          { profileId: 'q', state: paused },
        ],
        'cooperative',
      )?.streak,
    ).toBe(1);
    // Someone missed it: no household week.
    const missed = state({
      profile: profile({ id: 'q' }),
      logs: [log('2026-11-16T19:00', 'yoga', { profileId: 'q' })],
    });
    expect(
      householdGame(
        [
          { profileId: 'p', state: a },
          { profileId: 'q', state: missed },
        ],
        'cooperative',
      )?.streak,
    ).toBe(0);
  });
});
