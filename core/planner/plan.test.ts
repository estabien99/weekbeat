import { describe, expect, it } from 'vitest';
import { knowledgeRules } from '../../knowledge/index.ts';
import type { KnowledgeRule, LoggedActivity } from '../model/types.ts';
import { sessionLength } from './candidates.ts';
import { hasEquipment, open, placeFits } from './constraints.ts';
import { planWeek } from './plan.ts';
import { WINDOWS, act, gym, home, input, profile, saturdayMtb, weekday } from './fixtures.ts';
import type { Candidate } from './types.ts';

const starts = (p: ReturnType<typeof planWeek>) =>
  p.proposals.map((x) => `${x.session.activityTypeId}@${x.session.start}`);

describe('planWeek', () => {
  it('fills the week up to the goal, Coach days first, and explains each session', () => {
    const plan = planWeek(input());
    // The gym wins over home: covered by the membership, which outweighs 15 min travel each way.
    expect(starts(plan)).toEqual(['bodyweight-vigorous@2026-11-23T18:15', 'bodyweight-vigorous@2026-11-24T18:15']);
    const [first] = plan.proposals;
    expect(first!.session).toMatchObject({ status: 'proposed', placeId: 'gym', programmeId: 'prog-fl' });
    expect(first!.session.why).toEqual({
      de: 'Körpergewichtstraining, intensiv am Montag: zählt für dein Wochenziel (2 von 3), Tag 1 von 2 in „Freeletics Coach“.',
      en: 'Bodyweight training, vigorous on Monday: counts toward your weekly goal (2 of 3), day 1 of 2 in "Freeletics Coach".',
    });
    expect(plan.notes).toEqual([]);
  });

  it('gives the same plan for the same input, whatever the order of the lists', () => {
    const a = planWeek(input());
    const shuffled = input();
    shuffled.places = [...shuffled.places].reverse();
    shuffled.catalogue = [...shuffled.catalogue].reverse();
    shuffled.rules = [...shuffled.rules].reverse();
    shuffled.availability = [{ ...shuffled.availability[0]!, windows: [...WINDOWS].reverse() }];
    expect(planWeek(shuffled)).toEqual(a);
    expect(planWeek(input())).toEqual(a);
  });

  it('never plans beyond the goal or the weekly maximum the person set', () => {
    expect(planWeek(input({ profiles: [profile({ goals: [{ kind: 'sessions', target: 1 }] })] })).proposals).toEqual(
      [],
    );
    const capped = planWeek(input({ profiles: [profile({ game: { enabled: true, weeklyMaxSessions: 2 } })] }));
    expect(capped.proposals).toHaveLength(1);
    expect(capped.notes).toEqual([]);
  });

  it('plans nothing before notBefore (the app passes "now")', () => {
    const plan = planWeek(input({ notBefore: '2026-11-24T19:00' }));
    expect(plan.proposals.map((p) => p.session.start)).toEqual(['2026-11-25T18:15', '2026-11-26T18:15']);
  });

  it('does not propose a session again in a slot the person let go', () => {
    const first = planWeek(input()).proposals[0]!.session;
    const plan = planWeek(input({ anchors: [saturdayMtb, { ...first, status: 'skipped' }] }));
    expect(
      plan.proposals.some((p) => p.session.start === first.start && p.session.activityTypeId === first.activityTypeId),
    ).toBe(false);
    expect(plan.proposals).toHaveLength(2);
  });

  it('moves around calendar busy blocks', () => {
    const plan = planWeek(
      input({
        availability: [
          {
            id: 'av-a',
            profileId: 'p-a',
            windows: WINDOWS,
            busy: [{ start: '2026-11-23T17:30', end: '2026-11-23T20:00', source: 'gcal' }],
          },
        ],
      }),
    );
    expect(starts(plan)[0]).toBe('bodyweight-vigorous@2026-11-24T18:15');
  });

  it('plans nothing while paused, and only after the pause ends', () => {
    const all = planWeek(input({ profiles: [profile({ pausedUntil: '2026-11-30' })] }));
    expect(all.proposals).toEqual([]);
    expect(all.notes[0]).toMatchObject({ kind: 'paused' });
    expect(all.notes[0]!.text.de).toContain('30.11.2026');

    const part = planWeek(input({ profiles: [profile({ pausedUntil: '2026-11-25' })] }));
    expect(part.proposals.every((p) => p.session.start >= '2026-11-26')).toBe(true);
    expect(part.proposals).toHaveLength(2);
  });

  it('takes equipment sessions to a place that has it, with travel and membership', () => {
    const plan = planWeek(
      input({
        programmes: [
          {
            id: 'prog-gym',
            profileId: 'p-a',
            name: 'Gym plan',
            daysPerWeek: 1,
            typicalSessions: [{ activityTypeId: 'weight-training', durationMin: 45, equipment: ['barbell'] }],
          },
        ],
      }),
    );
    const gymSession = plan.proposals.find((p) => p.session.placeId === 'gym')!;
    expect(gymSession.session.start).toBe('2026-11-23T18:15');
    expect(gymSession.terms.find((t) => t.term === 'membership')!.value).toBe(1);
  });

  it('counts a Plus 1 membership for places of the main membership', () => {
    const plan = planWeek(
      input({
        memberships: [
          { id: 'm-main', provider: 'wellpass', ownerProfileId: 'someone-else' },
          { id: 'm-plus1', provider: 'wellpass', ownerProfileId: 'p-a', linkedToMembershipId: 'm-wp' },
        ],
        programmes: [],
        profiles: [
          profile({ hobbies: ['weight-training'], goals: [{ kind: 'sessions', target: 1, categories: ['strength'] }] }),
        ],
        places: [gym],
        anchors: [],
      }),
    );
    expect(plan.proposals[0]!.terms.find((t) => t.term === 'membership')!.value).toBe(1);
  });

  it('applies recovery gaps only from a recovery rule in the knowledge base', () => {
    const rule: KnowledgeRule = {
      id: 'test-recovery',
      part: 'recovery',
      summary: { de: 'Test', en: 'Test' },
      source: { title: 'Test', url: 'https://example.org' },
      quote: 'Test rule for the planner engine only.',
      confidence: 'low',
      lastReviewed: '2026-11-22',
      data: { afterIntensity: 'vigorous', forCategories: ['strength'], minHours: 48 },
    };
    const plan = planWeek(input({ rules: [...knowledgeRules, rule] }));
    // Monday's session ends 18:45; 48 h later is Wednesday 18:45, after Wednesday's 18:15 start.
    expect(starts(plan)).toEqual(['bodyweight-vigorous@2026-11-23T18:15', 'bodyweight-vigorous@2026-11-26T18:15']);
  });

  it('suggests a sourced complement (strength next to MTB) when the person has no programme', () => {
    const plan = planWeek(input({ programmes: [], profiles: [profile({ goals: [{ kind: 'sessions', target: 2 }] })] }));
    const [p] = plan.proposals;
    expect(act(p!.session.activityTypeId).category).toBe('strength');
    expect(p!.session.why.en).toContain('balances Mountain biking for neck, hands and wrists, lower back and knees');
  });

  it('counts this week’s logs once, also when they confirm an anchor', () => {
    const log = (over: Partial<LoggedActivity>): LoggedActivity => ({
      id: 'l',
      profileId: 'p-a',
      activityTypeId: 'mtb',
      start: '2026-11-28T09:05',
      durationMin: 115,
      source: 'garmin',
      ...over,
    });
    const confirmed = planWeek(input({ logs: [log({ plannedSessionId: 's-mtb' })] }));
    expect(confirmed.proposals).toHaveLength(2);
    const extra = planWeek(input({ logs: [log({ id: 'l2', activityTypeId: 'yoga', start: '2026-11-23T07:00' })] }));
    expect(extra.proposals).toHaveLength(1);
  });

  it('explains when the week has fewer free slots than the goal, without blame', () => {
    const windows = [weekday(1, '18:00', '19:00')];
    const plan = planWeek(input({ availability: [{ id: 'av', profileId: 'p-a', windows, busy: [] }] }));
    expect(plan.proposals).toHaveLength(1);
    expect(plan.notes).toEqual([
      {
        kind: 'goal-short',
        profileId: 'p-a',
        text: {
          de: 'Diese Woche passen 2 von 3 Einheiten in deine freien Zeiten.',
          en: '2 of 3 sessions fit into your free time this week.',
        },
      },
    ]);
  });

  it('asks for a session length instead of guessing one', () => {
    const plan = planWeek(input({ programmes: [], profiles: [profile({ preferredSessionMin: undefined })] }));
    expect(plan.proposals).toEqual([]);
    expect(plan.notes.map((n) => n.kind)).toEqual(['no-duration']);

    const partly = planWeek(input({ profiles: [profile({ preferredSessionMin: undefined })] }));
    expect(partly.proposals).toHaveLength(2);
    const more = planWeek(
      input({ profiles: [profile({ preferredSessionMin: undefined, goals: [{ kind: 'sessions', target: 4 }] })] }),
    );
    // Coach days used up; more would need a session length.
    expect(more.proposals).toHaveLength(2);
    expect(more.notes.map((n) => n.kind)).toEqual(['no-duration']);
  });

  it('asks for a hobby or plan when there is nothing to suggest', () => {
    const plan = planWeek(input({ programmes: [], anchors: [], profiles: [profile({ hobbies: [] })] }));
    expect(plan.notes.map((n) => n.kind)).toEqual(['no-activity']);
  });

  it('offers a deload after enough strength weeks, never applies it', () => {
    // One Wednesday in each of the weeks before the planned one.
    const wednesdays = ['2026-11-18', '2026-11-11', '2026-11-04', '2026-10-28'];
    const weeksBack = (n: number): LoggedActivity[] =>
      wednesdays.slice(0, n).map((d, i) => ({
        id: `l${i}`,
        profileId: 'p-a',
        activityTypeId: 'bodyweight-vigorous',
        start: `${d}T18:00`,
        durationMin: 30,
        source: 'manual',
      }));
    expect(planWeek(input({ logs: weeksBack(3) })).offers).toEqual([]);
    const plan = planWeek(input({ logs: weeksBack(4) }));
    expect(plan.offers).toHaveLength(1);
    expect(plan.offers[0]).toMatchObject({ kind: 'deload', category: 'strength', weeks: 4, ruleId: 'deload-strength' });
    expect(plan.proposals).toHaveLength(2);
  });
});

describe('session length', () => {
  it('uses the person’s setting, else minutes ÷ sessions goal, else nothing', () => {
    expect(sessionLength(profile())).toBe(45);
    expect(
      sessionLength(
        profile({
          preferredSessionMin: undefined,
          goals: [
            { kind: 'minutes', target: 150 },
            { kind: 'sessions', target: 4 },
          ],
        }),
      ),
    ).toBe(38);
    expect(sessionLength(profile({ preferredSessionMin: undefined }))).toBeUndefined();
  });

  it('treats a length below one minute as unknown and asks for one', () => {
    const tiny = profile({
      preferredSessionMin: undefined,
      goals: [
        { kind: 'sessions', target: 3 },
        { kind: 'minutes', target: 1 },
      ],
    });
    expect(sessionLength(tiny)).toBeUndefined();
    expect(sessionLength(profile({ preferredSessionMin: -30 }))).toBeUndefined();
    expect(sessionLength(profile({ preferredSessionMin: 0.4 }))).toBeUndefined();

    const plan = planWeek(input({ programmes: [], profiles: [tiny] }));
    expect(plan.proposals).toEqual([]);
    expect(plan.notes.map((n) => n.kind)).toEqual(['no-duration']);
    const negative = planWeek(input({ programmes: [], profiles: [profile({ preferredSessionMin: -30 })] }));
    expect(negative.notes.map((n) => n.kind)).toEqual(['no-duration']);
  });

  it('skips programme sessions without a positive length', () => {
    const plan = planWeek(
      input({
        programmes: [
          {
            id: 'prog-zero',
            profileId: 'p-a',
            name: 'Broken',
            daysPerWeek: 2,
            typicalSessions: [{ activityTypeId: 'bodyweight-vigorous', durationMin: 0, equipment: [] }],
          },
        ],
      }),
    );
    expect(plan.proposals.every((p) => p.session.durationMin >= 1)).toBe(true);
    expect(new Set(plan.proposals.map((p) => p.session.id)).size).toBe(plan.proposals.length);
  });
});

describe('hard constraints', () => {
  const cand = (over: Partial<Candidate>): Candidate => ({
    profileId: 'p-a',
    activity: act('weight-training'),
    place: gym,
    origin: 'programme',
    equipment: ['barbell'],
    start: 18 * 60,
    durationMin: 45,
    ...over,
  });

  it('respects opening hours', () => {
    expect(open(cand({}))).toBe(true);
    expect(open(cand({ start: 21 * 60 + 30 }))).toBe(false);
    expect(open(cand({ start: 5 * 24 * 60 + 10 * 60 }))).toBe(false); // Saturday: no hours listed
    expect(open(cand({ place: home }))).toBe(true);
  });

  it('needs the equipment at the place', () => {
    expect(hasEquipment(cand({}))).toBe(true);
    expect(hasEquipment(cand({ place: home }))).toBe(false);
    expect(hasEquipment(cand({ place: undefined, equipment: [] }))).toBe(true);
  });

  it('matches indoor and outdoor activities to places', () => {
    expect(placeFits(act('mtb'), home)).toBe(false);
    expect(placeFits(act('mtb'), undefined)).toBe(true);
    expect(placeFits(act('mtb'), { ...home, kind: 'outdoor' })).toBe(true);
    expect(placeFits(act('weight-training'), undefined)).toBe(false);
    expect(placeFits(act('yoga'), gym)).toBe(true);
    expect(placeFits(act('jogging'), gym)).toBe(false);
  });
});
