import type { Programme, Weekday } from '../core/index.ts';
import { answersOf, type CoachKind } from '../connectors/freeletics-coach/coach.ts';

/** The Coach plan as the form holds it (numbers as typed). */
export interface CoachDraft {
  use: boolean;
  daysPerWeek: string;
  durationMin: string;
  kind: CoachKind;
  weightPlaceIds: string[];
  weekdays: Weekday[];
}

export function coachDraftOf(p: Programme | undefined, sessionMin: number | undefined): CoachDraft {
  if (!p) {
    return {
      use: false,
      daysPerWeek: '',
      durationMin: sessionMin ? String(sessionMin) : '',
      kind: 'bodyweight',
      weightPlaceIds: [],
      weekdays: [],
    };
  }
  const a = answersOf(p);
  return { ...a, use: true, daysPerWeek: String(a.daysPerWeek), durationMin: String(a.durationMin) };
}

/** The first field the draft gets wrong (an `errors.*` key), or undefined. */
export function coachDraftError(d: CoachDraft): string | undefined {
  if (!d.use) return undefined;
  const days = Number(d.daysPerWeek);
  if (d.daysPerWeek === '' || !Number.isInteger(days) || days < 1 || days > 7) return 'daysPerWeek';
  const min = Number(d.durationMin);
  if (d.durationMin === '' || !Number.isInteger(min) || min < 1) return 'sessionMin';
  if (d.kind !== 'bodyweight' && d.weightPlaceIds.length === 0) return 'programmePlaces';
  return undefined;
}
