import { openComplements } from '../knowledge.ts';
import type { ActivityType, Place, Profile, Programme } from '../model/types.ts';
import { placeFits } from './constraints.ts';
import { DAY_MIN, dayIndexOf, hhmmToMin, subtract } from './time.ts';
import type { Candidate, PlanInput, SharedSession } from './types.ts';
import { type ProfileWeek, occupied } from './week.ts';

/** Step 1, collect inputs: what the person could do this week, and where and when it would fit. */

export interface Option {
  activity: ActivityType;
  durationMin: number;
  equipment: string[];
  /** Only at these places (programme sessions the person tied to places). */
  placeIds?: string[];
  origin: Candidate['origin'];
  programme?: Programme;
}

/**
 * Session length for activities no programme sets: the person's own setting, else minutes goal ÷ sessions
 * goal when the profile has both. Undefined when neither exists (the planner then asks instead of guessing).
 */
export function sessionLength(profile: Profile): number | undefined {
  if (profile.preferredSessionMin !== undefined) return validLength(profile.preferredSessionMin);
  const minutes = profile.goals.find((g) => g.kind === 'minutes');
  const sessions = profile.goals.find((g) => g.kind === 'sessions');
  if (minutes && sessions && sessions.target > 0) return validLength(Math.round(minutes.target / sessions.target));
  return undefined;
}

/** Lengths below one minute count as unknown, so the planner asks instead of planning empty sessions. */
function validLength(n: number): number | undefined {
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}

export interface Options {
  options: Option[];
  /** Hobbies or complements were left out because no session length is known. */
  missingLength: boolean;
}

export function optionsFor(week: ProfileWeek, input: PlanInput): Options {
  const { profile } = week;
  const byId = new Map(input.catalogue.map((a) => [a.id, a]));
  const options: Option[] = [];

  for (const programme of input.programmes.filter((p) => p.profileId === profile.id)) {
    const count = week.done.filter((d) => d.programmeId === programme.id).length;
    const typical = programme.typicalSessions[count % programme.typicalSessions.length];
    if (count >= programme.daysPerWeek || !typical || validLength(typical.durationMin) === undefined) continue;
    const activity = byId.get(typical.activityTypeId);
    if (!activity) continue;
    options.push({
      activity,
      durationMin: typical.durationMin,
      equipment: typical.equipment,
      ...(typical.placeIds ? { placeIds: typical.placeIds } : {}),
      origin: 'programme',
      programme,
    });
  }

  const length = sessionLength(profile);
  const hobbies = [...profile.hobbies].sort().flatMap((id) => byId.get(id) ?? []);
  const weekIds = [...profile.hobbies, ...week.done.flatMap((d) => (d.activity ? [d.activity.id] : []))];
  const complements = openComplements(weekIds, input.catalogue, input.rules)
    .flatMap((o) => o.candidates)
    .sort((a, b) => a.id.localeCompare(b.id));
  const extra: [ActivityType, Option['origin']][] = [
    ...hobbies.map((a) => [a, 'hobby'] as [ActivityType, Option['origin']]),
    ...complements.map((a) => [a, 'complement'] as [ActivityType, Option['origin']]),
  ];
  if (length === undefined) return { options, missingLength: extra.length > 0 };
  for (const [activity, origin] of extra) {
    if (options.some((o) => o.activity.id === activity.id && o.origin !== 'programme')) continue;
    options.push({ activity, durationMin: length, equipment: [], origin });
  }
  return { options, missingLength: false };
}

function startsIn(free: { start: number; end: number }, place: Place | undefined): number[] {
  const travel = place?.travelMin ?? 0;
  const earliest = free.start + travel;
  if (!place?.openingHours) return [earliest];
  const base = dayIndexOf(free.start) * DAY_MIN;
  return place.openingHours
    .filter((h) => h.day === dayIndexOf(free.start) + 1)
    .map((h) => Math.max(earliest, base + hhmmToMin(h.from)))
    .sort((a, b) => a - b);
}

/**
 * Candidates: every option at every fitting place (or nowhere in particular, for activities that need no
 * place), at the earliest start in each free stretch of the person's windows. Hard constraints check them next.
 */
export function candidatesFor(
  week: ProfileWeek,
  options: readonly Option[],
  places: readonly Place[],
  shared: readonly SharedSession[] = [],
): Candidate[] {
  const blocked = [...week.busy, ...week.done.map(occupied)];
  const free = week.windows.flatMap((w) => subtract(w, blocked));
  const others = shared.filter((s) => s.profileId !== week.profile.id);
  const out: Candidate[] = [];
  for (const option of options) {
    const allowed = option.placeIds;
    const at: (Place | undefined)[] = places.filter(
      (p) => placeFits(option.activity, p) && (!allowed || allowed.includes(p.id)),
    );
    if (!allowed && option.equipment.length === 0 && placeFits(option.activity, undefined)) at.push(undefined);
    for (const place of at) {
      const joinable = others.filter((s) => s.activityId === option.activity.id && s.placeId === place?.id);
      for (const f of free) {
        // Also try the start of a household member's same session, so the two can train together.
        const joins = joinable.map((s) => s.start).filter((s) => s >= f.start && s < f.end);
        for (const start of [...new Set([...startsIn(f, place), ...joins])].sort((a, b) => a - b)) {
          const together = joinable.filter((s) => s.start === start).map((s) => s.profileId);
          out.push({
            profileId: week.profile.id,
            activity: option.activity,
            place,
            programme: option.programme,
            origin: option.origin,
            equipment: option.equipment,
            start,
            durationMin: option.durationMin,
            ...(together.length > 0 ? { withProfileIds: [...new Set(together)].sort() } : {}),
          });
        }
      }
    }
  }
  return out;
}
