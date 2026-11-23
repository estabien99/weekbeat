import type {
  ActivityCategory,
  ActivityType,
  BodyArea,
  ComplementData,
  I18nText,
  DeloadData,
  Id,
  Impact,
  Intensity,
  IntensityThresholdsData,
  KnowledgeRule,
  WeeklyTargetData,
} from './model/types.ts';

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

const IMPACT_ORDER: Record<Impact, number> = { low: 0, medium: 1, high: 2 };

/** Whether an activity covers a complement rule's suggestion (category or minimum impact). */
export function matchesSuggestion(activity: ActivityType, suggest: ComplementData['suggest']): boolean {
  if (suggest.categories?.includes(activity.category)) return true;
  if (suggest.minImpact && activity.impact) return IMPACT_ORDER[activity.impact] >= IMPACT_ORDER[suggest.minImpact];
  return false;
}

export interface OpenComplement {
  ruleId: Id;
  need: ComplementData['need'];
  focusAreas: BodyArea[];
  /** Catalogue activities that would cover the need. */
  candidates: ActivityType[];
}

/**
 * Complement needs a set of activities (e.g. one week's) leaves open: a rule applies when one of its
 * `forActivityIds` is in the set, and stays open while no activity in the set matches its suggestion.
 */
export function openComplements(
  activityIds: readonly Id[],
  catalogue: readonly ActivityType[],
  rules: readonly KnowledgeRule[],
): OpenComplement[] {
  const done = catalogue.filter((a) => activityIds.includes(a.id));
  return rules.flatMap((r) => {
    if (r.part !== 'complement') return [];
    const d = r.data;
    if (!d.forActivityIds.some((id) => activityIds.includes(id))) return [];
    if (done.some((a) => matchesSuggestion(a, d.suggest))) return [];
    return [
      {
        ruleId: r.id,
        need: d.need,
        focusAreas: d.focusAreas ?? [],
        candidates: catalogue.filter((a) => matchesSuggestion(a, d.suggest)),
      },
    ];
  });
}

/** The deload rule for a category, if the knowledge base has one. */
export function deloadRuleFor(
  category: ActivityCategory,
  rules: readonly KnowledgeRule[],
): (DeloadData & { ruleId: Id }) | undefined {
  for (const r of rules)
    if (r.part === 'deload' && r.data.forCategories.includes(category)) return { ...r.data, ruleId: r.id };
  return undefined;
}

/**
 * Whether a deload may be offered after this many consecutive training weeks. An offer only: the planner
 * never forces a deload, and pause mode (not this) handles breaks.
 */
export function deloadOffered(trainingWeeks: number, rule: Pick<DeloadData, 'everyWeeks'>): boolean {
  return trainingWeeks >= rule.everyWeeks.min;
}

/** The self-check questions (issue #4): history first, then symptoms, in knowledge-base order. */
export function screeningQuestions(
  rules: KnowledgeRule[],
): { id: string; kind: 'history' | 'symptom'; question: I18nText }[] {
  const qs = rules.flatMap((r) => (r.part === 'screening' ? [{ id: r.id, ...r.data }] : []));
  return [...qs.filter((q) => q.kind === 'history'), ...qs.filter((q) => q.kind === 'symptom')];
}
