import { GAME_TUNING } from './tuning.ts';

/** Total XP needed for `level` (level 1 needs none). */
export function xpForLevel(level: number, step: number = GAME_TUNING.levelStep): number {
  const n = Math.max(0, level - 1);
  return (step * n * (n + 1)) / 2;
}

/** Level for a total XP: starts at 1, only goes up because XP only grows. */
export function levelOf(xp: number, step: number = GAME_TUNING.levelStep): number {
  let level = 1;
  while (xpForLevel(level + 1, step) <= xp) level++;
  return level;
}
