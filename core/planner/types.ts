import type {
  ActivityCategory,
  ActivityType,
  Availability,
  I18nText,
  Id,
  IsoDate,
  KnowledgeRule,
  LoggedActivity,
  Membership,
  PlannedSession,
  Place,
  Profile,
  Programme,
} from '../model/types.ts';

/** Everything the planner reads. A snapshot: the planner never reads the clock, storage or the network. */
export interface PlanInput {
  /** Monday of the week to plan (local date). */
  weekStart: IsoDate;
  profiles: Profile[];
  availability: Availability[];
  places: Place[];
  memberships: Membership[];
  programmes: Programme[];
  /**
   * Sessions already fixed for this week (accepted plan, Saturday MTB, Coach days). They are kept as they are,
   * block their time and count toward goals; only statuses proposed, accepted and done count.
   */
  anchors: PlannedSession[];
  /** Logged activities of this and earlier weeks (deload offers, recovery gaps, this week's progress). */
  logs: LoggedActivity[];
  catalogue: ActivityType[];
  rules: KnowledgeRule[];
  /** Engine tuning; defaults to DEFAULT_WEIGHTS. */
  weights?: ScoringWeights;
}

/** Scoring terms, in the order they are listed in a "why" when they weigh the same. */
export const TERMS = [
  'programme',
  'together',
  'complement',
  'goalFit',
  'variety',
  'membership',
  'spread',
  'distance',
] as const;
export type Term = (typeof TERMS)[number];

/**
 * How much each scoring term counts. These are engine tuning, not fitness rules: they only rank options that
 * already passed every hard constraint, and they never add sessions beyond the person's goal.
 */
export type ScoringWeights = Record<Term, number>;

export const DEFAULT_WEIGHTS: ScoringWeights = {
  programme: 2,
  together: 2,
  complement: 2,
  goalFit: 3,
  variety: 1,
  membership: 1,
  spread: 1.5,
  distance: 1,
};

/** A possible session before constraints and scoring. Times are week minutes (see time.ts). */
export interface Candidate {
  profileId: Id;
  activity: ActivityType;
  place?: Place;
  programme?: Programme;
  /** Why the planner considered this activity at all. */
  origin: 'programme' | 'hobby' | 'complement';
  equipment: string[];
  start: number;
  durationMin: number;
  /** Household members who have the same activity at the same place and start. */
  withProfileIds?: Id[];
}

/** A household member's session another person could join (same activity, place and start). */
export interface SharedSession {
  profileId: Id;
  activityId: Id;
  placeId?: Id;
  /** Week minutes. */
  start: number;
}

export type Rejection =
  'paused' | 'outside-window' | 'overlap' | 'closed' | 'programme-day' | 'equipment' | 'setting' | 'recovery';

export interface ScoreTerm {
  term: Term;
  /** 0…1 before weighting. */
  value: number;
  weighted: number;
}

export interface Proposal {
  session: PlannedSession;
  score: number;
  terms: ScoreTerm[];
}

/** Offers are never applied by the planner; the person decides. */
export interface DeloadOffer {
  kind: 'deload';
  profileId: Id;
  ruleId: Id;
  category: ActivityCategory;
  /** Consecutive weeks with training in the category, up to the planned week. */
  weeks: number;
  durationDays: number;
  text: I18nText;
}

export type NoteKind = 'paused' | 'goal-short' | 'no-duration' | 'no-activity';

/** Neutral information for the person: why the plan has fewer sessions than the goal. Never a reproach. */
export interface PlanNote {
  kind: NoteKind;
  profileId: Id;
  text: I18nText;
}

export interface Plan {
  weekStart: IsoDate;
  /** New proposals only (status "proposed"); anchors are not repeated. */
  proposals: Proposal[];
  offers: DeloadOffer[];
  notes: PlanNote[];
}
