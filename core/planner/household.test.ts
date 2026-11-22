import { describe, expect, it } from 'vitest';
import type { PlannedSession } from '../model/types.ts';
import { WINDOWS, input, profile, saturdayMtb, weekday } from './fixtures.ts';
import { planWeek } from './plan.ts';

const b = profile({
  id: 'p-b',
  name: 'B',
  hobbies: ['mtb'],
  goals: [{ kind: 'sessions', target: 1, categories: ['cycling'] }],
  preferredSessionMin: 120,
});
const bWindows = { id: 'av-b', profileId: 'p-b', windows: [weekday(6, '09:00', '13:00')], busy: [] };

describe('household planning', () => {
  it('joins a household member’s fixed session and says so', () => {
    const anchorAt10: PlannedSession = { ...saturdayMtb, start: '2026-11-28T10:00' };
    const base = input();
    const plan = planWeek(
      input({
        profiles: [profile(), b],
        availability: [...base.availability, bWindows],
        anchors: [anchorAt10],
      }),
    );
    const bSession = plan.proposals.find((p) => p.session.profileId === 'p-b')!.session;
    // 10:00 (together) beats B's own earliest free start at 09:00.
    expect(bSession).toMatchObject({ activityTypeId: 'mtb', start: '2026-11-28T10:00', withProfileIds: ['p-a'] });
    expect(bSession.why.de).toContain('zusammen mit A');
    expect(bSession.why.en).toContain('together with A');
  });

  it('joins a proposal of this run and marks it on both sessions; each keeps their own goal', () => {
    const plan = planWeek(
      input({
        profiles: [
          profile(),
          profile({
            id: 'p-b',
            name: 'B',
            hobbies: ['bodyweight-vigorous'],
            goals: [{ kind: 'sessions', target: 1 }],
          }),
        ],
        availability: [...input().availability, { id: 'av-b', profileId: 'p-b', windows: WINDOWS, busy: [] }],
      }),
    );
    const mine = plan.proposals.filter((p) => p.session.profileId === 'p-a');
    const theirs = plan.proposals.filter((p) => p.session.profileId === 'p-b');
    expect(mine).toHaveLength(2);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]!.session).toMatchObject({ start: '2026-11-23T18:15', placeId: 'gym', withProfileIds: ['p-a'] });
    expect(mine[0]!.session.withProfileIds).toEqual(['p-b']);
  });

  it('only pairs people from the same household', () => {
    const base = input();
    const plan = planWeek(
      input({
        profiles: [profile(), { ...b, householdId: 'other' }],
        availability: [...base.availability, bWindows],
        anchors: [{ ...saturdayMtb, start: '2026-11-28T10:00' }],
      }),
    );
    const bSession = plan.proposals.find((p) => p.session.profileId === 'p-b')!.session;
    expect(bSession.start).toBe('2026-11-28T09:00');
    expect(bSession.withProfileIds).toBeUndefined();
  });
});
