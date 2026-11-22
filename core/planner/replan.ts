import type { I18nText, Id, IsoDateTime, PlannedSession } from '../model/types.ts';
import { type Option, candidatesFor, optionsFor } from './candidates.ts';
import type { Candidate } from './types.ts';
import { type Ranked, contexts, normalize, rank, sharedFor, toSession } from './plan.ts';
import { dayIndexOf, minuteOfWeek } from './time.ts';
import { DEFAULT_WEIGHTS, type PlanInput } from './types.ts';
import { buildWeek } from './week.ts';
import { WEEKDAYS, explain } from './why.ts';

/**
 * Step 5, replan: a session was missed, or its slot stopped working (calendar change). The planner never
 * changes the plan itself; it returns offers and the person picks one: a new slot this week, a short home
 * session, or simply letting it go.
 */

/** Length of the short home fallback (concept doc → "Replan": "20-minute home session"). */
export const FALLBACK_MIN = 20;

export interface ReplanRequest {
  /** The affected session; must be in `input.anchors`. */
  sessionId: Id;
  /** Earliest start for any offer, usually "now" as the app sees it (the planner never reads the clock). */
  notBefore: IsoDateTime;
  /** How many new slots to offer (display choice, on separate days). */
  maxSlots?: number;
}

export type ReplanOffer =
  | { kind: 'new-slot'; replaces: Id; session: PlannedSession; score: number }
  | { kind: 'fallback'; replaces: Id; session: PlannedSession }
  | { kind: 'skip'; replaces: Id; text: I18nText };

/** At a home place, or nowhere in particular for an activity that works indoors and outdoors. */
const atHome = (c: Candidate) => (c.place ? c.place.kind === 'home' : c.activity.setting === 'both');

export function replan(raw: PlanInput, req: ReplanRequest): ReplanOffer[] {
  const input0 = normalize(raw);
  const affected = input0.anchors.find((s) => s.id === req.sessionId);
  if (!affected) throw new Error(`Session ${req.sessionId} is not in the plan`);
  const skip: ReplanOffer = {
    kind: 'skip',
    replaces: affected.id,
    text: { de: 'Diesmal auslassen – kein Problem.', en: 'Let it go this time – no problem.' },
  };
  // Plan as if the affected session were not there: its time is free and it no longer counts.
  const input: PlanInput = { ...input0, anchors: input0.anchors.filter((s) => s.id !== affected.id) };
  const profile = input.profiles.find((p) => p.id === affected.profileId);
  const activity = input.catalogue.find((a) => a.id === affected.activityTypeId);
  if (!profile || !activity) return [skip];

  const week = buildWeek(profile, input);
  const { cctx, sctx } = contexts(week, input);
  const weights = input.weights ?? DEFAULT_WEIGHTS;
  const notBefore = minuteOfWeek(req.notBefore, input.weekStart);
  const shared = sharedFor(profile, input, []);
  const programme = input.programmes.find((p) => p.id === affected.programmeId);
  const equipment = programme?.typicalSessions.find((t) => t.activityTypeId === activity.id)?.equipment ?? [];
  const same: Option = {
    activity,
    durationMin: affected.durationMin,
    equipment,
    origin: programme ? 'programme' : 'hobby',
    programme,
  };
  const later = (r: Ranked) => r.c.start >= notBefore;

  // New slots: the same session at the same place later this week, best first, at most one per day.
  const samePlace = candidatesFor(week, [same], input.places, shared).filter((c) => c.place?.id === affected.placeId);
  const slots: Ranked[] = [];
  for (const r of rank(samePlace, cctx, sctx, weights).filter(later)) {
    if (slots.some((s) => dayIndexOf(s.c.start) === dayIndexOf(r.c.start))) continue;
    slots.push(r);
    if (slots.length === (req.maxSlots ?? 3)) break;
  }

  // Fallback: a short session at home without equipment, the same activity if it works there, else one of the
  // person's own options (programme, hobby, sourced complement).
  const homeOptions = [same, ...optionsFor(week, input).options]
    .filter((o) => o.equipment.length === 0)
    .map((o) => ({ ...o, durationMin: FALLBACK_MIN, equipment: [] }));
  const fallback = rank(candidatesFor(week, homeOptions, input.places).filter(atHome), cctx, sctx, weights)
    .filter(later)
    // Stable sort: the same activity first, otherwise rank order.
    .sort((a, b) => Number(b.c.activity.id === activity.id) - Number(a.c.activity.id === activity.id))[0];

  const offers: ReplanOffer[] = slots.map((r) => ({
    kind: 'new-slot',
    replaces: affected.id,
    score: r.score,
    session: toSession(r.c, input.weekStart, `replan:${affected.id}:${r.c.start}`, explain(r.c, r.terms, sctx)),
  }));
  if (fallback) {
    const day = WEEKDAYS[dayIndexOf(fallback.c.start)]!;
    const name = fallback.c.activity.name;
    offers.push({
      kind: 'fallback',
      replaces: affected.id,
      session: toSession(fallback.c, input.weekStart, `fallback:${affected.id}:${fallback.c.start}`, {
        de: `Kurze Alternative: ${name.de}, ${FALLBACK_MIN} Min. zu Hause am ${day.de}.`,
        en: `Short alternative: ${name.en}, ${FALLBACK_MIN} min at home on ${day.en}.`,
      }),
    });
  }
  offers.push(skip);
  return offers;
}
