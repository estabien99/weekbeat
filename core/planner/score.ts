import { openComplements, type OpenComplement } from '../knowledge.ts';
import type { ActivityType, KnowledgeRule, Weekday, WeeklyGoal } from '../model/types.ts';
import { dayIndexOf } from './time.ts';
import { type Candidate, type ScoreTerm, type ScoringWeights, TERMS, type Term } from './types.ts';
import type { Done, ProfileWeek } from './week.ts';

/** Step 3, scoring: each term is a small function returning 0…1; the weighted sum ranks candidates. */

export function counts(goal: WeeklyGoal, activity: ActivityType | undefined): boolean {
  if (!goal.categories) return true;
  return !!activity && goal.categories.includes(activity.category);
}

export function progress(goal: WeeklyGoal, done: readonly Done[]): number {
  const relevant = done.filter((d) => counts(goal, d.activity));
  return goal.kind === 'sessions' ? relevant.length : relevant.reduce((sum, d) => sum + d.durationMin, 0);
}

export function unmetGoals(week: ProfileWeek): WeeklyGoal[] {
  return week.profile.goals.filter((g) => progress(g, week.done) < g.target);
}

export interface ScoreContext {
  week: ProfileWeek;
  /** Names of household members, for "together with …". */
  names?: ReadonlyMap<string, string>;
  rules: readonly KnowledgeRule[];
  catalogue: readonly ActivityType[];
}

/** Complement needs this week still leaves open (hobbies count as done regularly). */
export function openNeeds(ctx: ScoreContext): OpenComplement[] {
  const ids = [...ctx.week.profile.hobbies, ...ctx.week.done.flatMap((d) => (d.activity ? [d.activity.id] : []))];
  return openComplements(ids, ctx.catalogue, ctx.rules);
}

const TERM_FNS: Record<Term, (c: Candidate, ctx: ScoreContext) => number> = {
  /** Share of the still unmet goals this session counts toward. */
  goalFit: (c, ctx) => {
    const unmet = unmetGoals(ctx.week);
    return unmet.length === 0 ? 0 : unmet.filter((g) => counts(g, c.activity)).length / unmet.length;
  },
  /** Same activity, place and start as a household member: train together. */
  together: (c) => (c.withProfileIds?.length ? 1 : 0),
  /**
   * A session of the person's own programme (e.g. a Coach day); half as much off the days the programme is set to
   * now, so keeping them wins unless another day fits clearly better.
   */
  programme: (c) => {
    if (c.origin !== 'programme') return 0;
    const days = c.programme?.weekdays;
    return !days?.length || days.includes((dayIndexOf(c.start) + 1) as Weekday) ? 1 : 0.5;
  },
  /** Covers a complement need from the knowledge base (e.g. strength next to MTB). */
  complement: (c, ctx) => (openNeeds(ctx).some((n) => n.candidates.some((a) => a.id === c.activity.id)) ? 1 : 0),
  /** A category the week does not have yet. */
  variety: (c, ctx) => (ctx.week.done.some((d) => d.activity?.category === c.activity.category) ? 0 : 1),
  /** The place is covered by one of the person's memberships. */
  membership: (c, ctx) => (c.place?.membershipIds.some((id) => ctx.week.membershipIds.has(id)) ? 1 : 0),
  /** A day without another session. */
  spread: (c, ctx) => (ctx.week.done.some((d) => dayIndexOf(d.start) === dayIndexOf(c.start)) ? 0 : 1),
  /** Share of the time spent training rather than travelling. */
  distance: (c) => c.durationMin / (c.durationMin + 2 * (c.place?.travelMin ?? 0)),
};

export function scoreTerms(c: Candidate, ctx: ScoreContext, weights: ScoringWeights): ScoreTerm[] {
  return TERMS.map((term) => {
    const value = TERM_FNS[term](c, ctx);
    return { term, value, weighted: value * weights[term] };
  });
}

export function total(terms: readonly ScoreTerm[]): number {
  return terms.reduce((sum, t) => sum + t.weighted, 0);
}
