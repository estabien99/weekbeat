import type { Intensity } from '../model/types.ts';

/**
 * Game tuning: how many points things are worth. These are game design values chosen by the user
 * (23.11.2026, issue #7), not fitness rules, and they never steer the planner. Change them freely; nothing
 * here claims a health effect.
 */
export const GAME_TUNING = {
  /** XP per minute of a counted session, by WHO intensity band (the band itself comes from knowledge/). */
  xpPerMinute: { sedentary: 1, light: 1, moderate: 2, vigorous: 3 } satisfies Record<Intensity, number>,
  /** Bonus XP per counted session, once per reason. */
  bonus: { combo: 20, together: 20, variety: 20, complement: 20 },
  /** Level n + 1 is reached at levelStep × n(n+1)/2 total XP: 500, 1500, 3000, … */
  levelStep: 500,
} as const;

export type BonusReason = keyof typeof GAME_TUNING.bonus;
