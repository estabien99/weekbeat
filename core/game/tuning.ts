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
  /** Recovery bonus for a planned rest day kept free, at most once a week (user decision 23.11.2026, #4). */
  restDayXp: 20,
  /** Level n + 1 is reached at levelStep × n(n+1)/2 total XP: 500, 1500, 3000, … */
  levelStep: 500,
  /** Badges: total counted sessions, weeks in a row, categories in one week. */
  badgeSessions: [10, 50, 100],
  badgeStreaks: [4, 12, 26],
  badgeVarietyWeek: 3,
  /** Rule quests (monthly): weeks with the strength rule's days met; sessions that fit a complement rule. */
  questStrengthWeeks: 3,
  questComplementSessions: 4,
} as const;

/**
 * Seasonal quests (monthly, by local calendar month): game ideas chosen by the user on 23.11.2026, no fitness
 * claim. `indoor`/`outdoor` count activities whose setting allows it; `swimming` counts the category;
 * `categories` counts different categories.
 */
export const SEASONAL_QUESTS = [
  { key: 'winter-indoor', months: [12, 1, 2], kind: 'indoor', target: 4 },
  { key: 'spring-outdoor', months: [3, 4, 5], kind: 'outdoor', target: 4 },
  { key: 'summer-water', months: [6, 7, 8], kind: 'swimming', target: 2 },
  { key: 'autumn-mix', months: [9, 10, 11], kind: 'categories', target: 3 },
] as const;

export type BonusReason = keyof typeof GAME_TUNING.bonus;
