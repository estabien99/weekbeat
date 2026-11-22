import type { Intensity, IntensityThresholdsData, KnowledgeRule, WeeklyTargetData } from './model/types.ts';

/**
 * Pure functions over knowledge rules. The rules are passed in (from knowledge/), never hard-coded here,
 * so a reviewed change to the data changes the behaviour without code changes.
 */

export function intensityThresholds(rules: KnowledgeRule[]): IntensityThresholdsData {
  const rule = rules.find((r) => r.part === 'intensity');
  if (!rule || rule.part !== 'intensity') throw new Error('Knowledge base has no intensity rule');
  return rule.data;
}

/** WHO absolute-scale band for a MET value. */
export function intensityOf(met: number, t: IntensityThresholdsData): Intensity {
  if (met >= t.vigorousFromMet) return 'vigorous';
  if (met >= t.moderateFromMet) return 'moderate';
  if (met >= t.lightFromMet) return 'light';
  return 'sedentary';
}

/** The weekly-targets rule for an age in years, or undefined if no rule covers it. */
export function weeklyTargetFor(
  age: number,
  rules: KnowledgeRule[],
): (WeeklyTargetData & { ruleId: string }) | undefined {
  const matches = rules.flatMap((r) =>
    r.part === 'weekly-targets' && age >= r.data.ageFrom && (r.data.ageTo === undefined || age <= r.data.ageTo)
      ? [{ ...r.data, ruleId: r.id }]
      : [],
  );
  return matches[0];
}

/**
 * Converts vigorous minutes to moderate-equivalent minutes using the ratio implied by the target's own ranges
 * (WHO: 150–300 moderate ≙ 75–150 vigorous, i.e. 2:1). No ratio is assumed when the target has no ranges.
 */
export function moderateEquivalentMinutes(
  moderate: number,
  vigorous: number,
  target: Pick<WeeklyTargetData, 'moderateMinutes' | 'vigorousMinutes'>,
): number {
  const { moderateMinutes: m, vigorousMinutes: v } = target;
  if (!m || !v || v.min <= 0) throw new Error('Target has no moderate/vigorous ranges');
  return moderate + vigorous * (m.min / v.min);
}

/** Where a week's aerobic volume stands against the target range. */
export function weeklyAerobicStatus(
  moderateEquivalent: number,
  target: Pick<WeeklyTargetData, 'moderateMinutes'>,
): 'below' | 'in-range' | 'above' {
  const m = target.moderateMinutes;
  if (!m) throw new Error('Target has no moderate range');
  if (moderateEquivalent < m.min) return 'below';
  return moderateEquivalent <= m.max ? 'in-range' : 'above';
}
