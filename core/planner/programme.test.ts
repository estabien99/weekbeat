import { describe, expect, it } from 'vitest';
import type { Programme } from '../model/types.ts';
import { planWeek } from './plan.ts';
import { replan } from './replan.ts';
import { input } from './fixtures.ts';

const coach = (over: Partial<Programme> = {}): Programme => ({
  id: 'prog-fl',
  profileId: 'p-a',
  name: 'Freeletics Coach',
  connectorId: 'freeletics-coach',
  daysPerWeek: 2,
  typicalSessions: [{ activityTypeId: 'bodyweight-vigorous', durationMin: 30, equipment: [] }],
  ...over,
});
const coachDays = (p: ReturnType<typeof planWeek>) =>
  p.proposals.filter((x) => x.session.programmeId === 'prog-fl').map((x) => x.session.start.slice(0, 10));

describe('programme sessions', () => {
  it('prefers the days the programme is set to now', () => {
    // Without weekdays the first free days win (Mon, Tue); set to Wed and Fri, those win.
    expect(coachDays(planWeek(input({ programmes: [coach()] })))).toEqual(['2026-11-23', '2026-11-24']);
    expect(coachDays(planWeek(input({ programmes: [coach({ weekdays: [3, 5] })] })))).toEqual([
      '2026-11-25',
      '2026-11-27',
    ]);
  });

  it('plans sessions tied to places only there', () => {
    const weighted = coach({
      typicalSessions: [{ activityTypeId: 'weight-training', durationMin: 45, equipment: [], placeIds: ['gym'] }],
    });
    const plan = planWeek(input({ programmes: [weighted] }));
    const own = plan.proposals.filter((x) => x.session.programmeId === 'prog-fl');
    expect(own).toHaveLength(2);
    expect(own.every((x) => x.session.placeId === 'gym')).toBe(true);

    const nowhere = coach({
      typicalSessions: [{ activityTypeId: 'weight-training', durationMin: 45, equipment: [], placeIds: [] }],
    });
    expect(coachDays(planWeek(input({ programmes: [nowhere] })))).toEqual([]);
  });

  it('takes turns between session kinds', () => {
    const both = coach({
      typicalSessions: [
        { activityTypeId: 'weight-training', durationMin: 45, equipment: [], placeIds: ['gym'] },
        { activityTypeId: 'bodyweight-vigorous', durationMin: 45, equipment: [] },
      ],
    });
    const plan = planWeek(input({ programmes: [both] }));
    expect(plan.proposals.filter((x) => x.session.programmeId).map((x) => x.session.activityTypeId)).toEqual([
      'weight-training',
      'bodyweight-vigorous',
    ]);
  });

  it('offers no home fallback for a session tied to a place', () => {
    const weighted = coach({
      typicalSessions: [{ activityTypeId: 'weight-training', durationMin: 45, equipment: [], placeIds: ['gym'] }],
    });
    const base = input({ programmes: [weighted], anchors: [] });
    const missed = {
      id: 's-w',
      profileId: 'p-a',
      activityTypeId: 'weight-training',
      placeId: 'gym',
      programmeId: 'prog-fl',
      start: '2026-11-23T18:15',
      durationMin: 45,
      why: { de: '', en: '' },
      status: 'accepted' as const,
    };
    const offers = replan({ ...base, anchors: [missed] }, { sessionId: 's-w', notBefore: '2026-11-23T21:00' });
    const fallback = offers.find((o) => o.kind === 'fallback');
    // Whatever the home fallback is (e.g. a sourced complement), it is not the Coach session moved home.
    expect(fallback?.kind === 'fallback' && fallback.session.programmeId).toBeFalsy();
    expect(offers.filter((o) => o.kind === 'new-slot').every((o) => o.session.placeId === 'gym')).toBe(true);
  });
});
