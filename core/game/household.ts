import type { GameMode, Id, IsoDate } from '../model/types.ts';
import type { GameState, WeekStatus } from './state.ts';

export interface HouseholdGame {
  /** People with the game on. */
  members: number;
  /** This week: people who reached their own goal, and people not paused. */
  metThisWeek: number;
  activeThisWeek: number;
  /** Weeks in a row in which everyone not paused reached their own goal. */
  streak: number;
  bestStreak: number;
}

/**
 * Cooperative mode: a shared view over each person's own goals, nothing more. Paused people are left out of a
 * week; a week in which everyone is paused neither counts nor breaks the streak. Null unless the household plays
 * cooperatively.
 */
export function householdGame(
  members: readonly { profileId: Id; state: GameState | null }[],
  gameMode: GameMode | undefined,
): HouseholdGame | null {
  if (gameMode !== 'cooperative') return null;
  const playing = members.flatMap((m) => (m.state ? [m.state] : []));
  if (playing.length === 0) return null;

  const thisWeek = playing[0]!.weeks.at(-1)!.weekStart;
  const weekStarts = [...new Set(playing.flatMap((s) => s.weeks.map((w) => w.weekStart)))].sort();
  // A week before a person's first entry had nothing logged: it ended without their goal.
  const statusOf = (s: GameState, w: IsoDate): WeekStatus =>
    s.weeks.find((x) => x.weekStart === w)?.status ?? (w === thisWeek ? 'open' : 'missed');

  let streak = 0;
  let bestStreak = 0;
  let metThisWeek = 0;
  let activeThisWeek = 0;
  for (const w of weekStarts) {
    const active = playing.map((s) => statusOf(s, w)).filter((st) => st !== 'paused');
    if (w === thisWeek) {
      metThisWeek = active.filter((st) => st === 'met').length;
      activeThisWeek = active.length;
    }
    if (active.length === 0) continue;
    if (active.every((st) => st === 'met')) bestStreak = Math.max(bestStreak, ++streak);
    else if (w !== thisWeek) streak = 0;
  }
  return { members: playing.length, metThisWeek, activeThisWeek, streak, bestStreak };
}
