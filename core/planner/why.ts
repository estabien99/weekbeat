import type { ActivityCategory, ActivityType, BodyArea, I18nText, IsoDate, WeeklyGoal } from '../model/types.ts';
import { counts, openNeeds, progress, type ScoreContext, unmetGoals } from './score.ts';
import { dayIndexOf } from './time.ts';
import { type Candidate, type ScoreTerm, TERMS } from './types.ts';

/**
 * Step 4, explain: one line per session, German and English, built from the two strongest scoring terms.
 * Plain templates (core has no i18n library); the app shows the text in the person's language.
 */

export const WEEKDAYS: I18nText[] = [
  { de: 'Montag', en: 'Monday' },
  { de: 'Dienstag', en: 'Tuesday' },
  { de: 'Mittwoch', en: 'Wednesday' },
  { de: 'Donnerstag', en: 'Thursday' },
  { de: 'Freitag', en: 'Friday' },
  { de: 'Samstag', en: 'Saturday' },
  { de: 'Sonntag', en: 'Sunday' },
];

const AREAS: Record<BodyArea, I18nText> = {
  neck: { de: 'Nacken', en: 'neck' },
  'hand-wrist': { de: 'Hände und Handgelenke', en: 'hands and wrists' },
  'low-back': { de: 'unteren Rücken', en: 'lower back' },
  knee: { de: 'Knie', en: 'knees' },
};

export const CATEGORIES: Record<ActivityCategory, I18nText> = {
  cycling: { de: 'Radfahren', en: 'cycling' },
  strength: { de: 'Krafttraining', en: 'strength training' },
  hiit: { de: 'HIIT', en: 'HIIT' },
  mobility: { de: 'Mobilität', en: 'mobility' },
  endurance: { de: 'Ausdauer', en: 'endurance' },
  swimming: { de: 'Schwimmen', en: 'swimming' },
};

const join = (parts: string[], and: string) =>
  parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`;

function goalPhrase(goal: WeeklyGoal, after: number): I18nText {
  const unit = goal.kind === 'minutes' ? { de: ' Min.', en: ' min' } : { de: '', en: '' };
  return {
    de: `zählt für dein Wochenziel (${after} von ${goal.target}${unit.de})`,
    en: `counts toward your weekly goal (${after} of ${goal.target}${unit.en})`,
  };
}

function complementPhrase(c: Candidate, ctx: ScoreContext): I18nText | undefined {
  const need = openNeeds(ctx).find((n) => n.candidates.some((a) => a.id === c.activity.id));
  const rule = need && ctx.rules.find((r) => r.id === need.ruleId);
  if (!need || rule?.part !== 'complement') return undefined;
  const doneIds = [...ctx.week.profile.hobbies, ...ctx.week.done.flatMap((d) => (d.activity ? [d.activity.id] : []))];
  const triggerId = rule.data.forActivityIds.find((id) => doneIds.includes(id));
  const trigger: ActivityType | undefined = ctx.catalogue.find((a) => a.id === triggerId);
  const name = trigger?.name ?? { de: 'deinem Training', en: 'your training' };
  if (need.need === 'bone-loading')
    return { de: `belastet die Knochen als Ausgleich zu ${name.de}`, en: `adds bone loading next to ${name.en}` };
  const areas = need.focusAreas;
  if (areas.length === 0) return { de: `Ausgleich zu ${name.de}`, en: `balances ${name.en}` };
  return {
    de: `Ausgleich zu ${name.de} für ${join(
      areas.map((a) => AREAS[a].de),
      'und',
    )}`,
    en: `balances ${name.en} for ${join(
      areas.map((a) => AREAS[a].en),
      'and',
    )}`,
  };
}

function phrase(term: ScoreTerm['term'], c: Candidate, ctx: ScoreContext): I18nText | undefined {
  switch (term) {
    case 'programme': {
      const p = c.programme;
      if (!p) return undefined;
      const n = ctx.week.done.filter((d) => d.programmeId === p.id).length + 1;
      return { de: `Tag ${n} von ${p.daysPerWeek} in „${p.name}“`, en: `day ${n} of ${p.daysPerWeek} in "${p.name}"` };
    }
    case 'together': {
      const names = (c.withProfileIds ?? []).map((id) => ctx.names?.get(id) ?? id);
      return { de: `zusammen mit ${join(names, 'und')}`, en: `together with ${join(names, 'and')}` };
    }
    case 'complement':
      return complementPhrase(c, ctx);
    case 'goalFit': {
      const goal = unmetGoals(ctx.week).find((g) => counts(g, c.activity));
      if (!goal) return undefined;
      const add = goal.kind === 'sessions' ? 1 : c.durationMin;
      return goalPhrase(goal, progress(goal, ctx.week.done) + add);
    }
    case 'variety':
      return { de: 'bringt Abwechslung in die Woche', en: 'adds variety to your week' };
    case 'membership':
      return { de: 'mit deiner Mitgliedschaft', en: 'covered by your membership' };
    case 'spread':
      return { de: 'an einem sonst freien Tag', en: 'on an otherwise free day' };
    case 'distance':
      return (c.place?.travelMin ?? 0) === 0 ? { de: 'ohne Anfahrt', en: 'no travel' } : undefined;
  }
}

/** The "why" line, from the state of the week before this session is added. */
export function explain(c: Candidate, terms: readonly ScoreTerm[], ctx: ScoreContext): I18nText {
  const ranked = [...terms]
    .filter((t) => t.weighted > 0)
    .sort((a, b) => b.weighted - a.weighted || TERMS.indexOf(a.term) - TERMS.indexOf(b.term));
  const phrases: I18nText[] = [];
  for (const t of ranked) {
    const p = phrase(t.term, c, ctx);
    if (p) phrases.push(p);
    if (phrases.length === 2) break;
  }
  const day = WEEKDAYS[dayIndexOf(c.start)]!;
  const name = c.activity.name;
  const de = phrases.map((p) => p.de).join(', ');
  const en = phrases.map((p) => p.en).join(', ');
  return {
    de: de ? `${name.de} am ${day.de}: ${de}.` : `${name.de} am ${day.de}.`,
    en: en ? `${name.en} on ${day.en}: ${en}.` : `${name.en} on ${day.en}.`,
  };
}

/** German dates as people write them (23.11.2026); English keeps ISO, which reads the same everywhere. */
export function formatDate(date: IsoDate): I18nText {
  const [y, m, d] = date.split('-');
  return { de: `${d}.${m}.${y}`, en: date };
}
