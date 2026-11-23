import { describe, expect, it } from 'vitest';
import type { PlannedSession, Programme } from '../../core/index.ts';
import { activityCatalogue } from '../../knowledge/index.ts';
import { COACH_ACTIVITY, COACH_ID, answersOf, coachChecklist, coachProgramme, type CoachAnswers } from './coach.ts';

const answers = (over: Partial<CoachAnswers> = {}): CoachAnswers => ({
  daysPerWeek: 3,
  durationMin: 40,
  kind: 'both',
  weightPlaceIds: ['gym'],
  weekdays: [5, 1, 3],
  ...over,
});
const programme = (a = answers()): Programme => ({ id: 'prog', ...coachProgramme('p', a) });
const session = (start: string, over: Partial<PlannedSession> = {}): PlannedSession => ({
  id: start,
  profileId: 'p',
  activityTypeId: COACH_ACTIVITY.bodyweight,
  programmeId: 'prog',
  start,
  durationMin: 40,
  why: { de: '', en: '' },
  status: 'accepted',
  ...over,
});

describe('Freeletics Coach', () => {
  it('maps to catalogue activities', () => {
    for (const id of Object.values(COACH_ACTIVITY)) expect(activityCatalogue.some((a) => a.id === id)).toBe(true);
  });

  it('builds the programme from the answers and back', () => {
    const p = programme();
    expect(p).toMatchObject({ connectorId: COACH_ID, daysPerWeek: 3, weekdays: [1, 3, 5] });
    expect(p.typicalSessions.map((t) => [t.activityTypeId, t.placeIds])).toEqual([
      ['weight-training', ['gym']],
      ['bodyweight-vigorous', undefined],
    ]);
    expect(answersOf(p)).toEqual(answers({ weekdays: [1, 3, 5] }));
    const bw = programme(answers({ kind: 'bodyweight', weightPlaceIds: [], weekdays: [] }));
    expect(bw.weekdays).toBeUndefined();
    expect(answersOf(bw)).toMatchObject({ kind: 'bodyweight', weightPlaceIds: [], weekdays: [] });
    expect(answersOf(programme(answers({ kind: 'weighted' })))).toMatchObject({ kind: 'weighted' });
  });

  it('lists the days and places to set in the Coach', () => {
    const p = programme();
    const week = [
      session('2026-11-27T18:00'), // date -d 2026-11-27 +%A → Friday
      session('2026-11-23T18:00', { activityTypeId: COACH_ACTIVITY.weighted, placeId: 'gym' }), // Monday
      session('2026-11-25T18:00', { status: 'proposed' }), // Wednesday
      session('2026-11-26T18:00', { status: 'missed' }),
      session('2026-11-24T18:00', { programmeId: undefined }),
    ];
    expect(coachChecklist(p, week)).toEqual({
      days: [1, 3, 5],
      change: false,
      sessions: [
        { day: 1, activityTypeId: 'weight-training', placeId: 'gym', durationMin: 40 },
        { day: 3, activityTypeId: 'bodyweight-vigorous', durationMin: 40 },
        { day: 5, activityTypeId: 'bodyweight-vigorous', durationMin: 40 },
      ],
    });
    expect(coachChecklist(p, week.slice(0, 2))?.change).toBe(true);
    expect(coachChecklist(programme(answers({ weekdays: [] })), week)?.change).toBe(true);
    expect(coachChecklist(p, [])).toBeUndefined();
  });
});
