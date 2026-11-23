import { describe, expect, it } from 'vitest';
import type { PlannedSession } from '../model/types.ts';
import { input, profile, saturdayMtb } from './fixtures.ts';
import { FALLBACK_MIN, replan } from './replan.ts';

const monday: PlannedSession = {
  id: 's-mon',
  profileId: 'p-a',
  activityTypeId: 'bodyweight-vigorous',
  placeId: 'gym',
  programmeId: 'prog-fl',
  start: '2026-11-23T18:15',
  durationMin: 30,
  why: { de: '', en: '' },
  status: 'missed',
};
const week = (over = {}) => input({ anchors: [saturdayMtb, monday], ...over });

describe('replan', () => {
  it('offers new slots at the same place, a short home session and letting it go; changes nothing', () => {
    const before = week();
    const snapshot = structuredClone(before);
    const offers = replan(before, { sessionId: 's-mon', notBefore: '2026-11-24T08:00' });
    expect(offers.map((o) => o.kind)).toEqual(['new-slot', 'new-slot', 'new-slot', 'fallback', 'skip']);
    const slots = offers.flatMap((o) => (o.kind === 'new-slot' ? [o.session] : []));
    expect(slots.map((s) => s.start)).toEqual(['2026-11-24T18:15', '2026-11-25T18:15', '2026-11-26T18:15']);
    expect(slots.every((s) => s.placeId === 'gym' && s.status === 'proposed' && s.durationMin === 30)).toBe(true);
    const fallback = offers.find((o) => o.kind === 'fallback')!;
    expect(fallback.kind === 'fallback' && fallback.session).toMatchObject({
      activityTypeId: 'bodyweight-vigorous',
      placeId: 'home',
      durationMin: FALLBACK_MIN,
      start: '2026-11-24T18:00',
    });
    expect(fallback.kind === 'fallback' && fallback.session.why.de).toBe(
      'Kurze Alternative: Körpergewichtstraining, intensiv, 20 Min. zu Hause am Dienstag.',
    );
    expect(offers.every((o) => o.replaces === 's-mon')).toBe(true);
    expect(before).toEqual(snapshot);
    expect(replan(week(), { sessionId: 's-mon', notBefore: '2026-11-24T08:00' })).toEqual(offers);
  });

  it('never offers the session’s own slot as a new time', () => {
    const accepted = { ...monday, status: 'accepted' as const };
    const offers = replan(week({ anchors: [saturdayMtb, accepted] }), {
      sessionId: 's-mon',
      notBefore: '2026-11-23T08:00',
    });
    const slots = offers.flatMap((o) => (o.kind === 'new-slot' ? [o.session.start] : []));
    expect(slots).not.toContain(monday.start);
    expect(slots[0]).toBe('2026-11-24T18:15');
  });

  it('respects the earliest start and the number of slots asked for', () => {
    const one = replan(week(), { sessionId: 's-mon', notBefore: '2026-11-24T08:00', maxSlots: 1 });
    expect(one.filter((o) => o.kind === 'new-slot')).toHaveLength(1);
    // Friday 19:00: the gym is closed on Saturday, so only the home fallback after the MTB ride is left.
    const late = replan(week(), { sessionId: 's-mon', notBefore: '2026-11-27T19:00' });
    expect(late.map((o) => o.kind)).toEqual(['fallback', 'skip']);
    expect(late[0]!.kind === 'fallback' && late[0]!.session.start).toBe('2026-11-28T11:00');
  });

  it('falls back to one of the person’s own options when the activity needs no home', () => {
    const offers = replan(input(), { sessionId: 's-mtb', notBefore: '2026-11-28T08:00' });
    const fallback = offers.find((o) => o.kind === 'fallback');
    expect(fallback?.kind === 'fallback' && fallback.session.activityTypeId).toBe('bodyweight-vigorous');
    // Saturday's window is the only one left, and its own slot is not a new time.
    expect(offers.some((o) => o.kind === 'new-slot')).toBe(false);
  });

  it('only offers to let it go while paused or when nothing fits', () => {
    const paused = replan(week({ profiles: [profile({ pausedUntil: '2026-11-30' })] }), {
      sessionId: 's-mon',
      notBefore: '2026-11-24T08:00',
    });
    expect(paused.map((o) => o.kind)).toEqual(['skip']);
    const held = replan(week({ profiles: [profile({ health: { checkedOn: '2026-11-20', flagged: true } })] }), {
      sessionId: 's-mon',
      notBefore: '2026-11-24T08:00',
    });
    expect(held.map((o) => o.kind)).toEqual(['skip']);
    const unknown = replan(week({ anchors: [{ ...monday, activityTypeId: 'not-in-catalogue' }] }), {
      sessionId: 's-mon',
      notBefore: '2026-11-24T08:00',
    });
    expect(unknown.map((o) => o.kind)).toEqual(['skip']);
  });

  it('refuses sessions that are not in the plan', () => {
    expect(() => replan(week(), { sessionId: 'nope', notBefore: '2026-11-24T08:00' })).toThrow(/not in the plan/);
  });
});
