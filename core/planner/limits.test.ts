import { describe, expect, it } from 'vitest';
import type { LoggedActivity, Membership } from '../model/types.ts';
import { monthlyLimit } from './constraints.ts';
import { gym, input } from './fixtures.ts';
import { planWeek } from './plan.ts';

// Week of Monday 23 Nov 2026 (all days in November). The default input plans two gym sessions (Mon, Tue).
const gymVisits = (plan: ReturnType<typeof planWeek>) => plan.proposals.filter((p) => p.session.placeId === 'gym');

const checkIn = (id: string, start: string, placeId = 'gym'): LoggedActivity => ({
  id,
  profileId: 'p-a',
  activityTypeId: 'weight-training',
  start,
  durationMin: 45,
  source: 'checkin:wellpass',
  sourceRef: 'm-wp',
  placeId,
});

const withLimit = (over: Partial<Membership>) => ({
  memberships: [{ id: 'm-wp', provider: 'wellpass', ownerProfileId: 'p-a', ...over }],
});

describe('check-in limits', () => {
  it('plans no more membership visits than the monthly limit allows, counting earlier check-ins', () => {
    expect(gymVisits(planWeek(input()))).toHaveLength(2);
    const plan = planWeek(
      input({
        ...withLimit({ monthlyCheckInLimit: 3 }),
        // Two check-ins earlier in November, one in October (other month, does not count).
        logs: [checkIn('l1', '2026-11-03T18:00'), checkIn('l2', '2026-11-10T18:00'), checkIn('l0', '2026-10-27T18:00')],
      }),
    );
    expect(gymVisits(plan)).toHaveLength(1);
    expect(plan.proposals.length).toBeGreaterThanOrEqual(2); // the goal is still filled elsewhere where possible
    const note = plan.notes.find((n) => n.kind === 'check-in-limit');
    expect(note).toMatchObject({ membershipId: 'm-wp', profileId: 'p-a' });
    expect(note!.text.de).toContain('3 von 3 Check-ins im November');
  });

  it('applies a monthly limit only from its start date', () => {
    const plan = planWeek(input(withLimit({ monthlyCheckInLimit: 0, monthlyCheckInLimitFrom: '2027-01-01' })));
    expect(gymVisits(plan)).toHaveLength(2);
    expect(plan.notes.some((n) => n.kind === 'check-in-limit')).toBe(false);
    expect(
      monthlyLimit(
        {
          id: 'x',
          provider: 'wellpass',
          ownerProfileId: 'p',
          monthlyCheckInLimit: 10,
          monthlyCheckInLimitFrom: '2027-01-01',
        },
        '2027-01-01',
      ),
    ).toBe(10);
  });

  it('keeps to a daily limit', () => {
    const plan = planWeek(input({ ...withLimit({ dailyCheckInLimit: 1 }), logs: [checkIn('l1', '2026-11-23T07:00')] }));
    // Monday already has a check-in: no second membership visit that day.
    expect(gymVisits(plan).every((p) => !p.session.start.startsWith('2026-11-23'))).toBe(true);
  });

  it("keeps to a venue's own monthly visit limit", () => {
    const plan = planWeek(
      input({ places: [{ ...gym, monthlyVisitLimit: 1 }], logs: [checkIn('l1', '2026-11-02T18:00')] }),
    );
    expect(gymVisits(plan)).toHaveLength(0);
  });

  it('does not limit places no membership of the person covers', () => {
    const places = [{ ...gym, membershipIds: [] }];
    const limited = planWeek(input({ ...withLimit({ monthlyCheckInLimit: 1, dailyCheckInLimit: 1 }), places }));
    const free = planWeek(input({ places }));
    expect(limited.proposals.map((p) => p.session)).toEqual(free.proposals.map((p) => p.session));
    expect(limited.notes.some((n) => n.kind === 'check-in-limit')).toBe(false);
  });
});
