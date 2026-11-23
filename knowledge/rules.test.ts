import { describe, expect, it } from 'vitest';
import { matchesSuggestion, screeningQuestions } from '../core/knowledge.ts';
import { validateRows } from '../core/model/validate.ts';
import { activityCatalogue, knowledgeRules } from './index.ts';

const PARTS = ['intensity', 'weekly-targets', 'impact', 'complement', 'deload', 'recovery', 'principle', 'screening'];
const today = Date.now();
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

// Platform vocabularies, verified 22.11.2026 against the sources listed in knowledge/SOURCES.md.
const HEALTH_KIT = new Set([
  'cycling',
  'functionalStrengthTraining',
  'traditionalStrengthTraining',
  'highIntensityIntervalTraining',
  'yoga',
  'pilates',
  'flexibility',
  'running',
  'walking',
  'hiking',
  'swimming',
  'mixedCardio',
  'other',
]);
const FIT_SPORT = new Set([
  'generic',
  'running',
  'cycling',
  'fitnessEquipment',
  'swimming',
  'training',
  'walking',
  'hiking',
  'hiit',
]);
const FIT_SUB = new Set([
  'generic',
  'treadmill',
  'trail',
  'spin',
  'indoorCycling',
  'mountain',
  'lapSwimming',
  'openWater',
  'flexibilityTraining',
  'strengthTraining',
  'cardioTraining',
  'yoga',
  'pilates',
  'hiit',
]);

describe('knowledge rules', () => {
  it('have unique ids', () => {
    const ids = knowledgeRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(knowledgeRules.map((r) => [r.id, r] as const))('rule %s is sourced, quoted and reviewed', (_id, r) => {
    expect(PARTS).toContain(r.part);
    expect(r.source.url).toMatch(/^https:\/\//);
    expect(r.source.title.length).toBeGreaterThan(0);
    expect(r.quote.length).toBeGreaterThan(20);
    expect(['low', 'medium', 'high']).toContain(r.confidence);
    expect(r.lastReviewed).toMatch(isoDate);
    expect(new Date(r.lastReviewed).getTime()).toBeLessThanOrEqual(today);
    expect(r.summary.de.length).toBeGreaterThan(0);
    expect(r.summary.en.length).toBeGreaterThan(0);
  });

  it('have exactly one intensity rule with ordered thresholds', () => {
    const rules = knowledgeRules.filter((r) => r.part === 'intensity');
    expect(rules).toHaveLength(1);
    const d = rules[0]!.data as { lightFromMet: number; moderateFromMet: number; vigorousFromMet: number };
    expect(d.lightFromMet).toBeLessThan(d.moderateFromMet);
    expect(d.moderateFromMet).toBeLessThan(d.vigorousFromMet);
  });

  it('weekly targets do not overlap in age', () => {
    const ranges = knowledgeRules.flatMap((r) =>
      r.part === 'weekly-targets' ? [[r.data.ageFrom, r.data.ageTo ?? 200]] : [],
    );
    for (const [i, a] of ranges.entries()) {
      for (const b of ranges.slice(i + 1)) expect(a[1]! < b[0]! || b[1]! < a[0]!).toBe(true);
    }
  });

  it('have self-check questions for known conditions and for symptoms, in both languages', () => {
    const qs = screeningQuestions(knowledgeRules);
    expect(qs.some((q) => q.kind === 'history')).toBe(true);
    expect(qs.some((q) => q.kind === 'symptom')).toBe(true);
    for (const q of qs) {
      expect(q.question.de).toMatch(/\?$/);
      expect(q.question.en).toMatch(/\?$/);
    }
    expect(knowledgeRules.some((r) => r.id === 'screening-medical-clearance')).toBe(true);
  });
});

describe('impact, complement and deload rules', () => {
  const catalogueIds = new Set(activityCatalogue.map((a) => a.id));
  const categories = new Set(activityCatalogue.map((a) => a.category));

  it('reference only catalogue activities and categories', () => {
    for (const r of knowledgeRules) {
      if (r.part === 'impact') for (const id of r.data.activityIds) expect(catalogueIds).toContain(id);
      if (r.part === 'complement') {
        for (const id of r.data.forActivityIds) expect(catalogueIds).toContain(id);
        for (const c of r.data.suggest.categories ?? []) expect(categories).toContain(c);
        expect(r.data.suggest.categories?.length || r.data.suggest.minImpact).toBeTruthy();
      }
      if (r.part === 'deload') for (const c of r.data.forCategories) expect(categories).toContain(c);
    }
  });

  it('give each activity at most one impact level, and the catalogue matches the rules', () => {
    const byRule = new Map<string, string>();
    for (const r of knowledgeRules)
      if (r.part === 'impact')
        for (const id of r.data.activityIds) {
          expect(byRule.has(id)).toBe(false);
          byRule.set(id, r.data.level);
        }
    for (const a of activityCatalogue) {
      expect(a.impact).toBe(byRule.get(a.id));
      if (a.impact) expect(a.sources?.some((s) => s.url.startsWith('https://pmc.ncbi.nlm.nih.gov/'))).toBe(true);
    }
  });

  it('have complement suggestions some catalogue activity can meet', () => {
    for (const r of knowledgeRules)
      if (r.part === 'complement')
        expect(activityCatalogue.some((a) => matchesSuggestion(a, r.data.suggest))).toBe(true);
  });

  it('have deload windows that make sense', () => {
    for (const r of knowledgeRules) {
      if (r.part !== 'deload') continue;
      expect(r.data.everyWeeks.min).toBeGreaterThan(0);
      expect(r.data.everyWeeks.min).toBeLessThanOrEqual(r.data.everyWeeks.max);
      expect(r.data.durationDays).toBeGreaterThan(0);
      expect(r.confidence).toBe('low'); // expert consensus only; raise with a review that supports more
    }
  });

  it('keep catalogue muscle groups empty until a source supports them', () => {
    for (const a of activityCatalogue) expect(a.muscleGroups).toBeUndefined();
  });
});

describe('activity catalogue', () => {
  it('passes the import schema (catalogue rows can be stored and exported)', () => {
    expect(validateRows('activityTypes', activityCatalogue)).toBeNull();
  });

  it('has unique ids', () => {
    const ids = activityCatalogue.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(activityCatalogue.map((a) => [a.id, a] as const))('activity %s is sourced and mapped', (_id, a) => {
    expect(a.name.de.length).toBeGreaterThan(0);
    expect(a.name.en.length).toBeGreaterThan(0);
    expect(a.compendium?.code).toMatch(/^\d{5}$/);
    expect(a.compendium?.met).toBe(a.met);
    expect(a.met).toBeGreaterThan(0);
    expect(a.sources?.some((s) => s.url.startsWith('https://pacompendium.com/'))).toBe(true);
    expect(a.sources?.every((s) => s.url.startsWith('https://'))).toBe(true);
    expect(a.lastReviewed).toMatch(isoDate);
    expect(['low', 'medium', 'high']).toContain(a.confidence);
    expect(a.mapping.healthConnect).toMatch(/^EXERCISE_TYPE_[A-Z_]+$/);
    expect(HEALTH_KIT.has(a.mapping.healthKit!)).toBe(true);
    expect(FIT_SPORT.has(a.mapping.fit!.sport)).toBe(true);
    expect(FIT_SUB.has(a.mapping.fit!.subSport)).toBe(true);
    if (a.confidence !== 'high') expect(a.mappingNote ?? '').not.toBe('');
  });
});
