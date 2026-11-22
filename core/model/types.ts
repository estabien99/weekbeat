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
export type Intensity = 'light' | 'moderate' | 'vigorous';
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
  /** Pause mode (illness, holidays, injury) freezes goals and streaks. */
  pausedUntil?: IsoDate;
}

/** Sport-type mapping so connectors never need their own vocabulary. */
export interface ActivityMapping {
  /** Health Connect ExerciseSessionRecord type, e.g. "EXERCISE_TYPE_BIKING". */
  healthConnect?: string;
  /** Apple HealthKit HKWorkoutActivityType, e.g. "cycling". */
  healthKit?: string;
  /** Garmin FIT sport/sub_sport, e.g. "cycling/mountain". */
  fit?: string;
}

export interface ActivityType {
  id: Id;
  name: I18nText;
  category: string;
  intensity: Intensity;
  /** Metabolic equivalent from the Compendium of Physical Activities (knowledge base). */
  met?: number;
  muscleGroups: string[];
  impact: 'low' | 'medium' | 'high';
  setting: 'indoor' | 'outdoor' | 'both';
  mapping: ActivityMapping;
}

/** An external plan with typical sessions, e.g. Freeletics Coach (no API needed). */
export interface Programme {
  id: Id;
  profileId: Id;
  name: string;
  /** Connector id that steers it, e.g. "freeletics-coach". */
  connectorId?: string;
  daysPerWeek: number;
  typicalSessions: { activityTypeId: Id; durationMin: number; equipment: string[] }[];
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

/** A fitness rule with its source; the planner reads only these (knowledge/). */
export interface KnowledgeRule {
  id: Id;
  part: 'activity-catalogue' | 'weekly-targets' | 'complement' | 'load-recovery' | 'safety';
  summary: I18nText;
  /** Rule payload; its shape depends on `part`. */
  data: Record<string, unknown>;
  source: { title: string; url: string };
  confidence: 'low' | 'medium' | 'high';
  lastReviewed: IsoDate;
}
