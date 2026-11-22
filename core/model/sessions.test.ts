import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WeekbeatDB } from './db.ts';
import { acceptSessions, applyReplan, setSessionStatus } from './sessions.ts';
import type { PlannedSession } from './types.ts';

const session = (over: Partial<PlannedSession> = {}): PlannedSession => ({
  id: 's1',
  profileId: 'p',
  activityTypeId: 'yoga',
  start: '2026-11-23T18:00',
  durationMin: 45,
  why: { de: 'x', en: 'x' },
  status: 'proposed',
  ...over,
});

let db: WeekbeatDB;
beforeEach(() => {
  db = new WeekbeatDB(`test-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await db.delete();
});

describe('planned sessions', () => {
  it('accepts proposals idempotently', async () => {
    await acceptSessions(db, [session(), session({ id: 's2' })]);
    await acceptSessions(db, [session()]);
    expect((await db.plannedSessions.toArray()).map((s) => [s.id, s.status])).toEqual([
      ['s1', 'accepted'],
      ['s2', 'accepted'],
    ]);
  });

  it('marks sessions done or missed', async () => {
    await acceptSessions(db, [session()]);
    await setSessionStatus(db, 's1', 'done');
    expect((await db.plannedSessions.get('s1'))?.status).toBe('done');
    await setSessionStatus(db, 's1', 'done'); // same status again is fine
    await expect(setSessionStatus(db, 'nope', 'missed')).rejects.toThrow(/Unknown/);
  });

  it('applies a replan offer without losing the original', async () => {
    await acceptSessions(db, [session()]);
    await applyReplan(db, { replaces: 's1', session: session({ id: 's1b', start: '2026-11-24T18:00' }) }, 'moved');
    expect((await db.plannedSessions.get('s1'))?.status).toBe('moved');
    expect((await db.plannedSessions.get('s1b'))?.status).toBe('accepted');

    await acceptSessions(db, [session({ id: 's3' }), session({ id: 's4' })]);
    await applyReplan(db, { replaces: 's3' }, 'missed');
    await applyReplan(db, { replaces: 's4' }, 'moved');
    expect((await db.plannedSessions.get('s3'))?.status).toBe('missed');
    expect((await db.plannedSessions.get('s4'))?.status).toBe('skipped');
    await expect(applyReplan(db, { replaces: 'nope' }, 'missed')).rejects.toThrow(/Unknown/);
  });
});
