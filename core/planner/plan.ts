import { deloadOffered } from '../knowledge.ts';
import type { ActivityCategory, I18nText, IsoDate, PlannedSession, Profile, WeeklyGoal } from '../model/types.ts';
import { candidatesFor, optionsFor } from './candidates.ts';
import { type ConstraintContext, recoveryContext, rejectionOf } from './constraints.ts';
import { type ScoreContext, counts, progress, scoreTerms, total, unmetGoals } from './score.ts';
import { WEEK_MIN, isoAt, minuteOfWeek } from './time.ts';
import {
  type Candidate,
  DEFAULT_WEIGHTS,
  type DeloadOffer,
  type Plan,
  type PlanInput,
  type PlanNote,
  type Proposal,
  type ScoreTerm,
  type ScoringWeights,
  type SharedSession,
} from './types.ts';
import { COUNTING, type ProfileWeek, addPick, buildWeek, pausedThroughDay } from './week.ts';
import { CATEGORIES, explain, formatDate } from './why.ts';

const byId = <T extends { id: string }>(xs: readonly T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
const ORIGIN_ORDER: Record<Candidate['origin'], number> = { programme: 0, hobby: 1, complement: 2 };

export interface Ranked {
  c: Candidate;
  terms: ScoreTerm[];
  score: number;
}

/** Total order for equal scores, so the same input always gives the same plan. */
function better(a: Ranked, b: Ranked): number {
  return (
    b.score - a.score ||
    a.c.start - b.c.start ||
    ORIGIN_ORDER[a.c.origin] - ORIGIN_ORDER[b.c.origin] ||
    (a.c.place ? 0 : 1) - (b.c.place ? 0 : 1) ||
    a.c.activity.id.localeCompare(b.c.activity.id) ||
    (a.c.place?.id ?? '').localeCompare(b.c.place?.id ?? '')
  );
}

/** Steps 2 and 3: drop candidates that break a hard constraint, score the rest, best first. */
export function rank(
  candidates: readonly Candidate[],
  cctx: ConstraintContext,
  sctx: ScoreContext,
  weights: ScoringWeights,
): Ranked[] {
  return candidates
    .filter((c) => rejectionOf(c, cctx) === null)
    .map((c) => {
      const terms = scoreTerms(c, sctx, weights);
      return { c, terms, score: total(terms) };
    })
    .sort(better);
}

export function toSession(c: Candidate, weekStart: IsoDate, id: string, why: I18nText): PlannedSession {
  return {
    id,
    profileId: c.profileId,
    activityTypeId: c.activity.id,
    placeId: c.place?.id,
    programmeId: c.programme?.id,
    start: isoAt(weekStart, c.start),
    durationMin: c.durationMin,
    why,
    status: 'proposed',
    ...(c.withProfileIds ? { withProfileIds: c.withProfileIds } : {}),
  };
}

export function contexts(week: ProfileWeek, input: PlanInput): { cctx: ConstraintContext; sctx: ScoreContext } {
  return {
    cctx: {
      week,
      weekStart: input.weekStart,
      notBefore: input.notBefore === undefined ? undefined : minuteOfWeek(input.notBefore, input.weekStart),
      ...recoveryContext(input.rules),
    },
    sctx: {
      week,
      rules: input.rules,
      catalogue: input.catalogue,
      names: new Map(input.profiles.map((p) => [p.id, p.name])),
    },
  };
}

/** Sessions of the person's household members (anchors and this run's proposals) they could join. */
export function sharedFor(profile: Profile, input: PlanInput, proposals: readonly Proposal[]): SharedSession[] {
  const household = new Set(
    input.profiles.filter((p) => p.householdId === profile.householdId && p.id !== profile.id).map((p) => p.id),
  );
  return [...input.anchors.filter((s) => COUNTING.has(s.status)), ...proposals.map((p) => p.session)]
    .filter((s) => household.has(s.profileId))
    .map((s) => ({
      profileId: s.profileId,
      activityId: s.activityTypeId,
      placeId: s.placeId,
      start: minuteOfWeek(s.start, input.weekStart),
    }));
}

/** Sorts every list by id, so the order the caller passes things in never changes the plan. */
export function normalize(input: PlanInput): PlanInput {
  return {
    ...input,
    profiles: byId(input.profiles),
    availability: byId(input.availability),
    places: byId(input.places),
    memberships: byId(input.memberships),
    programmes: byId(input.programmes),
    anchors: byId(input.anchors),
    logs: byId(input.logs),
    catalogue: byId(input.catalogue),
    rules: byId(input.rules),
  };
}

function shortNote(profile: Profile, goal: WeeklyGoal, reached: number): PlanNote {
  const unit = goal.kind === 'sessions' ? { de: 'Einheiten', en: 'sessions' } : { de: 'Minuten', en: 'minutes' };
  return {
    kind: 'goal-short',
    profileId: profile.id,
    text: {
      de: `Diese Woche passen ${reached} von ${goal.target} ${unit.de} in deine freien Zeiten.`,
      en: `${reached} of ${goal.target} ${unit.en} fit into your free time this week.`,
    },
  };
}

const NOTE_TEXT: Record<'no-duration' | 'no-activity', I18nText> = {
  'no-duration': {
    de: 'Lege eine übliche Dauer pro Einheit fest, dann kann Weekbeat weitere Einheiten vorschlagen.',
    en: 'Set a usual session length so Weekbeat can suggest more sessions.',
  },
  'no-activity': {
    de: 'Füge ein Hobby oder einen Plan hinzu, dann hat Weekbeat etwas zum Vorschlagen.',
    en: 'Add a hobby or a plan so Weekbeat has something to suggest.',
  },
};

/** Consecutive weeks before the planned one with at least one logged session in the category. */
export function trainingWeeks(week: ProfileWeek, category: ActivityCategory): number {
  let weeks = 0;
  for (;;) {
    const from = -(weeks + 1) * WEEK_MIN;
    const to = -weeks * WEEK_MIN;
    if (!week.past.some((d) => d.activity?.category === category && d.start >= from && d.start < to)) return weeks;
    weeks++;
  }
}

function deloadOffers(week: ProfileWeek, input: PlanInput): DeloadOffer[] {
  return input.rules.flatMap((r) => {
    if (r.part !== 'deload') return [];
    return r.data.forCategories.flatMap((category) => {
      const weeks = trainingWeeks(week, category);
      if (!deloadOffered(weeks, r.data)) return [];
      const cat = CATEGORIES[category];
      const days = r.data.durationDays;
      return [
        {
          kind: 'deload' as const,
          profileId: week.profile.id,
          ruleId: r.id,
          category,
          weeks,
          durationDays: days,
          text: {
            de: `Seit ${weeks} Wochen ${cat.de}: Wenn du magst, plane ${days} Tage mit weniger Umfang ein. Nur ein Angebot.`,
            en: `${weeks} weeks of ${cat.en} in a row: if you like, take ${days} days with less volume. Just an offer.`,
          },
        },
      ];
    });
  });
}

function planProfile(profile: Profile, input: PlanInput, plan: Plan): void {
  const weights = input.weights ?? DEFAULT_WEIGHTS;
  const week = buildWeek(profile, input);
  const paused = pausedThroughDay(profile, input.weekStart);
  if (paused !== undefined && paused >= 0) {
    const date = formatDate(profile.pausedUntil!);
    plan.notes.push({
      kind: 'paused',
      profileId: profile.id,
      text: {
        de: `Pause bis ${date.de}: Ziele ruhen, bis dahin plant Weekbeat nichts.`,
        en: `Paused until ${date.en}: goals rest, Weekbeat plans nothing until then.`,
      },
    });
    if (paused >= 6) return;
  } else {
    plan.offers.push(...deloadOffers(week, input));
  }

  const { cctx, sctx } = contexts(week, input);
  const max = profile.game.weeklyMaxSessions;
  let stop: 'goal-short' | 'no-duration' | 'no-activity' | undefined;
  let missing = false;

  for (;;) {
    const unmet = unmetGoals(week);
    if (unmet.length === 0) break;
    if (max !== undefined && week.done.length >= max) break;
    const { options, missingLength } = optionsFor(week, input);
    missing = missingLength;
    const candidates = candidatesFor(week, options, input.places, sharedFor(profile, input, plan.proposals)).filter(
      (c) => unmet.some((g) => counts(g, c.activity)),
    );
    const best = rank(candidates, cctx, sctx, weights)[0];
    if (!best) {
      stop = options.length > 0 ? 'goal-short' : missingLength ? 'no-duration' : 'no-activity';
      break;
    }
    const why = explain(best.c, best.terms, sctx);
    const start = isoAt(input.weekStart, best.c.start);
    const session = toSession(best.c, input.weekStart, `plan:${profile.id}:${start}:${best.c.activity.id}`, why);
    // The member being joined sees it too (their why line stays as it was planned).
    for (const other of plan.proposals) {
      const s = other.session;
      if (!best.c.withProfileIds?.includes(s.profileId)) continue;
      if (s.activityTypeId !== session.activityTypeId || s.placeId !== session.placeId || s.start !== start) continue;
      s.withProfileIds = [...new Set([...(s.withProfileIds ?? []), profile.id])].sort();
    }
    plan.proposals.push({ session, score: best.score, terms: best.terms });
    addPick(week, best.c);
  }

  if (stop === 'goal-short') {
    for (const g of unmetGoals(week)) plan.notes.push(shortNote(profile, g, progress(g, week.done)));
    if (missing) plan.notes.push({ kind: 'no-duration', profileId: profile.id, text: NOTE_TEXT['no-duration'] });
  } else if (stop) {
    plan.notes.push({ kind: stop, profileId: profile.id, text: NOTE_TEXT[stop] });
  }
}

/**
 * Plans one week: collect inputs → hard constraints → score candidates → pick and explain. Pure and
 * deterministic: same input, same plan. Plans at most up to each person's own goal (and their weekly maximum,
 * if they set one); never more.
 */
export function planWeek(raw: PlanInput): Plan {
  const input = normalize(raw);
  const plan: Plan = { weekStart: input.weekStart, proposals: [], offers: [], notes: [] };
  for (const profile of input.profiles) planProfile(profile, input, plan);
  plan.proposals.sort(
    (a, b) => a.session.start.localeCompare(b.session.start) || a.session.profileId.localeCompare(b.session.profileId),
  );
  return plan;
}
