import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WeekbeatDB } from './db.ts';
import { addPlace, checkIn } from './memberships.ts';
import { addLog, mergedSessions, sameSession, sessionOfPlanned } from './merge.ts';
import { createHousehold } from './repo.ts';
import { completeSession } from './sessions.ts';
import type { LoggedActivity, PlannedSession } from './types.ts';

const log = (id: string, start: string, over: Partial<LoggedActivity> = {}): LoggedActivity => ({
  id,
  profileId: 'p',
  activityTypeId: 'weight-training',
  start,
  durationMin: 45,
  source: 'manual',
  ...over,
});

describe('sameSession', () => {
  it('needs the same person, overlapping time and no conflicting place or plan', () => {
    const a = log('a', '2026-11-23T18:00');
    expect(sameSession(a, log('b', '2026-11-23T18:30'))).toBe(true);
    expect(sameSession(a, log('b', '2026-11-23T18:45'))).toBe(false); // touching, not overlapping
    expect(sameSession(a, log('b', '2026-11-23T18:10', { profileId: 'q' }))).toBe(false);
    expect(sameSession({ ...a, placeId: 'x' }, log('b', '2026-11-23T18:10', { placeId: 'y' }))).toBe(false);
    expect(sameSession({ ...a, placeId: 'x' }, log('b', '2026-11-23T18:10'))).toBe(true);
    expect(
      sameSession({ ...a, plannedSessionId: 's1' }, log('b', '2026-11-23T18:10', { plannedSessionId: 's2' })),
    ).toBe(false);
    // Across midnight and a day apart.
    expect(sameSession(log('c', '2026-11-23T23:50'), log('d', '2026-11-24T00:10'))).toBe(true);
    expect(sameSession(a, log('e', '2026-11-24T18:00'))).toBe(false);
  });
});

describe('merging logs', () => {
  let db: WeekbeatDB;
  let p: string;
  beforeEach(async () => {
    db = new WeekbeatDB(`test-${crypto.randomUUID()}`);
    p = (
      await createHousehold(db, 'H', {
        name: 'A',
        lang: 'de',
        level: 'beginner',
        goal: { kind: 'sessions', target: 3 },
      })
    ).profile.id;
  });
  afterEach(async () => {
    await db.delete();
  });

  const coachSession = (placeId?: string): PlannedSession => ({
    id: 'coach',
    profileId: p,
    activityTypeId: 'weight-training',
    programmeId: 'prog',
    ...(placeId ? { placeId } : {}),
    start: '2026-11-23T18:00',
    durationMin: 45,
    why: { de: '', en: '' },
    status: 'accepted',
  });

  it('check-in tap, then "done" on the Coach session there: one visit, one combo session', async () => {
    const place = await addPlace(db, {
      name: 'Studio',
      kind: 'partner',
      membershipIds: [],
      categories: [],
      equipment: [],
    });
    await db.plannedSessions.add(coachSession(place.id));
    await checkIn(db, {
      profileId: p,
      placeId: place.id,
      activityTypeId: 'weight-training',
      start: '2026-11-23T17:55',
      durationMin: 60,
    });
    await completeSession(db, 'coach');

    const logs = await db.loggedActivities.toArray();
    expect(logs).toHaveLength(2);
    const sessions = mergedSessions(logs, await db.plannedSessions.toArray());
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ visit: true, workout: true, combo: true });
    expect(sessions[0]!.primary).toMatchObject({ start: '2026-11-23T17:55', plannedSessionId: 'coach' });
    expect(sessionOfPlanned(sessions, 'coach')).toBe(sessions[0]);
    expect((await db.plannedSessions.get('coach'))?.status).toBe('done');
    // Counted once: one unmerged visit.
    expect(logs.filter((l) => !l.mergedIntoId && l.placeId)).toHaveLength(1);
  });

  it('"done" on a Coach session without a place, then a check-in: the visit becomes the primary', async () => {
    const place = await addPlace(db, {
      name: 'Studio',
      kind: 'partner',
      membershipIds: [],
      categories: [],
      equipment: [],
    });
    await db.plannedSessions.add(coachSession());
    await completeSession(db, 'coach');
    await checkIn(db, {
      profileId: p,
      placeId: place.id,
      activityTypeId: 'weight-training',
      start: '2026-11-23T18:05',
      durationMin: 40,
    });
    const logs = await db.loggedActivities.toArray();
    const [session, ...rest] = mergedSessions(logs, await db.plannedSessions.toArray());
    expect(rest).toEqual([]);
    expect(session).toMatchObject({ combo: true, sources: ['checkin', 'manual'] });
    expect(session!.primary).toMatchObject({ placeId: place.id, plannedSessionId: 'coach', source: 'checkin' });
    expect(session!.logs.find((l) => l.source === 'manual')?.mergedIntoId).toBe(session!.primary.id);
  });

  it('a plain visit or a plain workout is no combo; a recorded workout at a visit is', async () => {
    await db.transaction('rw', db.loggedActivities, async () => {
      await addLog(db, log('v', '2026-11-23T10:00', { profileId: p, source: 'checkin', placeId: 'x' }));
      await addLog(db, log('m', '2026-11-24T10:00', { profileId: p }));
      await addLog(db, log('g1', '2026-11-25T10:00', { profileId: p, source: 'checkin', placeId: 'x' }));
      await addLog(db, log('g2', '2026-11-25T10:05', { profileId: p, source: 'garmin' }));
    });
    const sessions = mergedSessions(await db.loggedActivities.toArray());
    expect(sessions.map((s) => [s.primary.id, s.combo])).toEqual([
      ['v', false],
      ['m', false],
      ['g1', true],
    ]);
  });
});
