/**
 * Weekbeat data model, v0.1 (concept doc → "Data model").
 * Pure types: no storage, no UI. Every record carries a string id (crypto.randomUUID()).
 * Dates are ISO 8601 strings in local time (YYYY-MM-DD or YYYY-MM-DDTHH:mm), durations in minutes.
 */

export type Id = string;
export type IsoDate = string;
export type IsoDateTime = string;
export type Lang = 'de' | 'en';

/** Text shown to people: German first, English second. */
export interface I18nText {
  de: string;
  en: string;
}

export type GameMode = 'off' | 'solo' | 'cooperative' | 'competitive';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Intensity = 'sedentary' | 'light' | 'moderate' | 'vigorous';
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: 1 = Monday

export interface Household {
  id: Id;
  name: string;
  memberIds: Id[];
  sharedGoals: WeeklyGoal[];
  gameMode: GameMode;
}

export interface WeeklyGoal {
  kind: 'sessions' | 'minutes';
  target: number;
  /** Optional filter, e.g. only strength sessions count. */
  categories?: string[];
}

export interface Profile {
  id: Id;
  householdId: Id;
  name: string;
  lang: Lang;
  level: Level;
  goals: WeeklyGoal[];
  /** ActivityType ids the person already does (MTB, Freeletics, …). */
  hobbies: Id[];
  /** Free text the person enters; the planner only reads structured limitations. */
  limitations: { tag: string; note?: string }[];
  /** weeklyMaxSessions comes from the knowledge base (load rules), never a hard-coded number. */
  game: { enabled: boolean; weeklyMaxSessions?: number };
  /** Usual session length in minutes, set by the person; the planner uses it where no programme sets one. */
  preferredSessionMin?: number;
  /**
   * Propose the week by itself (on Sunday, or when a new week has no plan yet). Set in the optional interview;
   * the person still confirms every proposal.
   */
  autoPlan?: boolean;
  /** Pause mode (illness, holidays, injury) freezes goals and streaks. */
  pausedUntil?: IsoDate;
}

/** Sport-type mapping so connectors never need their own vocabulary. */
export interface ActivityMapping {
  /** Health Connect ExerciseSessionRecord constant, e.g. "EXERCISE_TYPE_BIKING". */
  healthConnect?: string;
  /** Apple HealthKit HKWorkoutActivityType case, e.g. "cycling". */
  healthKit?: string;
  /** Garmin FIT SDK profile enum names (camelCase, as in the SDK), e.g. { sport: "cycling", subSport: "mountain" }. */
  fit?: { sport: string; subSport: string };
}

export interface Source {
  title: string;
  url: string;
}

/** Entry of the 2024 Adult Compendium of Physical Activities, quoted verbatim. */
export interface CompendiumEntry {
  code: string;
  met: number;
  description: string;
}

/** Bone-loading impact: low = non-impact (e.g. cycling, swimming). */
export type Impact = 'low' | 'medium' | 'high';

export type ActivityCategory = 'cycling' | 'strength' | 'hiit' | 'mobility' | 'endurance' | 'swimming';

/**
 * An activity the planner can schedule. Catalogue entries ship in knowledge/activities.json; users may add
 * their own later. Intensity is not stored: it is derived from `met` with the WHO thresholds rule.
 */
export interface ActivityType {
  id: Id;
  name: I18nText;
  category: ActivityCategory;
  /** Metabolic equivalent (catalogue: from the Compendium). */
  met: number;
  compendium?: CompendiumEntry;
  setting: 'indoor' | 'outdoor' | 'both';
  /** Catalogue: only where a source supports it (none yet, see knowledge/SOURCES.md). */
  muscleGroups?: string[];
  /** Bone-loading impact; catalogue values must match an `impact` rule in knowledge/rules.json. */
  impact?: Impact;
  mapping: ActivityMapping;
  /** Open question about a mapping, to settle with real data. */
  mappingNote?: string;
  /** Catalogue entries only: where the values come from and when they were checked. */
  sources?: Source[];
  confidence?: Confidence;
  lastReviewed?: IsoDate;
}

export type Confidence = 'low' | 'medium' | 'high';

/** An external plan with typical sessions, e.g. Freeletics Coach (no API needed). */
export interface Programme {
  id: Id;
  profileId: Id;
  name: string;
  /** Connector id that steers it, e.g. "freeletics-coach". */
  connectorId?: string;
  daysPerWeek: number;
  /** Sessions in the order the programme repeats them; each kind may be limited to the person's chosen places. */
  typicalSessions: ProgrammeSession[];
  /**
   * Weekdays the programme is set to now (e.g. the days chosen in the Freeletics Coach). The planner prefers
   * them, so the plan only asks for a settings change when another day fits clearly better.
   */
  weekdays?: Weekday[];
}

export interface ProgrammeSession {
  activityTypeId: Id;
  durationMin: number;
  equipment: string[];
  /** Only at these places (e.g. where the person has the weights); absent = wherever the activity fits. */
  placeIds?: Id[];
}

export interface Membership {
  id: Id;
  /** Provider module id, e.g. "wellpass". */
  provider: string;
  tier?: string;
  ownerProfileId: Id;
  /** e.g. Plus 1 linked to a main account. */
  linkedToMembershipId?: Id;
  monthlyCostShareEur?: number;
  /** Check-ins the plan allows, as the person entered them (or as the provider states them, see the app). */
  dailyCheckInLimit?: number;
  monthlyCheckInLimit?: number;
  /** First day the monthly limit applies; before it there is none. */
  monthlyCheckInLimitFrom?: IsoDate;
}

export interface Place {
  id: Id;
  name: string;
  kind: 'partner' | 'own' | 'outdoor' | 'home';
  membershipIds: Id[];
  address?: string;
  categories: string[];
  equipment: string[];
  openingHours?: { day: Weekday; from: string; to: string }[];
  bookingUrl?: string;
  singleVisitPriceEur?: number;
  travelMin?: number;
  /** Visits per calendar month the venue allows through a membership (e.g. Urban Sports Club venue limits). */
  monthlyVisitLimit?: number;
}

export interface TimeWindow {
  day: Weekday;
  from: string; // HH:mm
  to: string;
}

export interface Availability {
  id: Id;
  profileId: Id;
  windows: TimeWindow[];
  /** Busy blocks from calendars; source tells which connector delivered them. */
  busy: { start: IsoDateTime; end: IsoDateTime; source: string }[];
}

export type SessionStatus = 'proposed' | 'accepted' | 'done' | 'missed' | 'moved' | 'skipped';

export interface PlannedSession {
  id: Id;
  profileId: Id;
  activityTypeId: Id;
  placeId?: Id;
  programmeId?: Id;
  start: IsoDateTime;
  durationMin: number;
  /** One-line reason, shown to the user. */
  why: I18nText;
  status: SessionStatus;
  /** Shared session in the household view. */
  withProfileIds?: Id[];
}

export interface LoggedActivity {
  id: Id;
  profileId: Id;
  activityTypeId: Id;
  start: IsoDateTime;
  durationMin: number;
  /** "manual", "garmin", "checkin:wellpass", … */
  source: string;
  sourceRef?: string;
  /** Where it happened (check-ins); counts toward check-in limits and the value meter. */
  placeId?: Id;
  load?: number;
  plannedSessionId?: Id;
  /** Logs from several sources merged into one session before they count. */
  mergedIntoId?: Id;
}

/** Game state: derived from logs, never edited by hand. */
export interface Quest {
  id: Id;
  profileId?: Id;
  householdId?: Id;
  title: I18nText;
  from: IsoDate;
  to: IsoDate;
  target: number;
  progress: number;
  ruleId?: Id;
}

export interface Badge {
  id: Id;
  profileId: Id;
  key: string;
  earnedAt: IsoDateTime;
}

export interface XPEvent {
  id: Id;
  profileId: Id;
  loggedActivityId?: Id;
  at: IsoDateTime;
  xp: number;
  /** "base", "complement", "variety", "together", "combo", … */
  reason: string;
}

/** WHO intensity bands on the absolute (MET) scale. */
export interface IntensityThresholdsData {
  lightFromMet: number;
  moderateFromMet: number;
  vigorousFromMet: number;
}

/** Weekly activity targets for an age group (minutes per week unless stated). */
export interface WeeklyTargetData {
  ageFrom: number;
  /** Inclusive; absent = no upper bound. */
  ageTo?: number;
  /** Adults: weekly ranges. */
  moderateMinutes?: { min: number; max: number };
  vigorousMinutes?: { min: number; max: number };
  /** Children and adolescents: average per day. */
  mvpaMinutesPerDayAverage?: number;
  /** Days per week with muscle-strengthening activity (at least). */
  strengthDaysMin?: number;
  /** Children: days with vigorous + muscle/bone strengthening activity; older adults: multicomponent balance + strength. */
  extraDaysMin?: number;
  extraKind?: 'vigorous-muscle-bone' | 'multicomponent-balance-strength';
}

/** Which catalogue activities have an impact level (the rule's quote names the activity kinds). */
export interface ImpactData {
  level: Impact;
  activityIds: Id[];
}

/** Body areas a source names; shown in the planner's "why", never used for diagnosis. */
export type BodyArea = 'neck' | 'hand-wrist' | 'low-back' | 'knee';

/**
 * Complement: doing any of `forActivityIds` leaves a need that activities matching `suggest` cover.
 * The planner may suggest such an activity; it never makes one mandatory.
 */
export interface ComplementData {
  need: 'bone-loading' | 'overuse-prevention';
  forActivityIds: Id[];
  /** An activity matches if it is in one of `categories` or has at least `minImpact` (either is enough). */
  suggest: { categories?: ActivityCategory[]; minImpact?: Impact };
  focusAreas?: BodyArea[];
}

/** Deload: a period of reduced training volume after a block of training in these categories. */
export interface DeloadData {
  forCategories: ActivityCategory[];
  /** Weeks of training after which a deload may be offered. */
  everyWeeks: { min: number; max: number };
  durationDays: number;
  reduce: 'volume';
}

/**
 * Recovery gap: after a session at `afterIntensity` or higher (in `forCategories`, if given), the next such
 * session waits at least `minHours`. No rule of this part ships until a source supports one; the planner's
 * check is inactive without it.
 */
export interface RecoveryData {
  afterIntensity: Exclude<Intensity, 'sedentary'>;
  forCategories?: ActivityCategory[];
  minHours: number;
}

interface RuleBase {
  id: Id;
  summary: I18nText;
  source: Source;
  /** Verbatim sentence(s) from the source the rule encodes. */
  quote: string;
  confidence: Confidence;
  lastReviewed: IsoDate;
}

/** A fitness rule with its source; the planner reads only these (knowledge/). */
export type KnowledgeRule =
  | (RuleBase & { part: 'intensity'; data: IntensityThresholdsData })
  | (RuleBase & { part: 'weekly-targets'; data: WeeklyTargetData })
  | (RuleBase & { part: 'impact'; data: ImpactData })
  | (RuleBase & { part: 'complement'; data: ComplementData })
  | (RuleBase & { part: 'deload'; data: DeloadData })
  | (RuleBase & { part: 'recovery'; data: RecoveryData })
  | (RuleBase & { part: 'principle'; data: Record<string, never> });
