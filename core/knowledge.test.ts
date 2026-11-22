import { describe, expect, it } from 'vitest';
import { activityCatalogue, knowledgeRules } from '../knowledge/index.ts';
import {
  deloadOffered,
  deloadRuleFor,
  intensityOf,
  intensityThresholds,
  matchesSuggestion,
  moderateEquivalentMinutes,
  openComplements,
  weeklyAerobicStatus,
  weeklyTargetFor,
} from './knowledge.ts';

const t = intensityThresholds(knowledgeRules);

describe('intensity (WHO thresholds from the knowledge base)', () => {
  it('bands MET values at the WHO boundaries', () => {
    expect(intensityOf(1.2, t)).toBe('sedentary');
    expect(intensityOf(1.5, t)).toBe('light');
    expect(intensityOf(2.9, t)).toBe('light');
    expect(intensityOf(3, t)).toBe('moderate');
    expect(intensityOf(5.9, t)).toBe('moderate');
    expect(intensityOf(6, t)).toBe('vigorous');
  });

  it('classifies catalogue activities sensibly', () => {
    const band = (id: string) => intensityOf(activityCatalogue.find((a) => a.id === id)!.met, t);
    expect(band('mtb')).toBe('vigorous');
    expect(band('brisk-walking')).toBe('moderate');
    expect(band('yoga')).toBe('light');
  });

  it('fails loudly without an intensity rule', () => {
    expect(() => intensityThresholds([])).toThrow(/intensity/);
  });
});

describe('weekly targets', () => {
  it('picks the age group', () => {
    expect(weeklyTargetFor(35, knowledgeRules)?.ruleId).toBe('who-weekly-targets-adults');
    expect(weeklyTargetFor(64, knowledgeRules)?.ruleId).toBe('who-weekly-targets-adults');
    expect(weeklyTargetFor(65, knowledgeRules)?.ruleId).toBe('who-weekly-targets-older-adults');
    expect(weeklyTargetFor(12, knowledgeRules)?.ruleId).toBe('who-weekly-targets-children');
    expect(weeklyTargetFor(3, knowledgeRules)).toBeUndefined();
  });

  it('counts vigorous minutes with the ratio implied by the ranges', () => {
    const adults = weeklyTargetFor(40, knowledgeRules)!;
    expect(moderateEquivalentMinutes(60, 45, adults)).toBe(150);
    expect(weeklyAerobicStatus(149, adults)).toBe('below');
    expect(weeklyAerobicStatus(150, adults)).toBe('in-range');
    expect(weeklyAerobicStatus(301, adults)).toBe('above');
  });

  it('refuses targets without ranges', () => {
    const children = weeklyTargetFor(10, knowledgeRules)!;
    expect(() => moderateEquivalentMinutes(10, 10, children)).toThrow();
    expect(() => weeklyAerobicStatus(10, children)).toThrow();
  });
});

describe('complement rules', () => {
  const ids = (xs: { ruleId: string }[]) => xs.map((x) => x.ruleId);

  it('suggests an impact activity for a cycling-only week', () => {
    const open = openComplements(['cycling', 'stationary-bike'], activityCatalogue, knowledgeRules);
    expect(ids(open)).toEqual(['complement-cycling-bone']);
    expect(open[0]!.need).toBe('bone-loading');
    expect(open[0]!.candidates.map((a) => a.id)).toContain('jogging');
    expect(open[0]!.candidates.every((a) => a.impact === 'medium' || a.impact === 'high')).toBe(true);
  });

  it('closes the need once a matching activity is in the set', () => {
    expect(openComplements(['cycling', 'jogging'], activityCatalogue, knowledgeRules)).toEqual([]);
    expect(openComplements(['mtb', 'weight-training'], activityCatalogue, knowledgeRules)).toEqual([]);
  });

  it('suggests strength with the sourced focus areas for MTB', () => {
    const [mtb] = openComplements(['mtb'], activityCatalogue, knowledgeRules);
    expect(mtb!.ruleId).toBe('complement-mtb-overuse');
    expect(mtb!.focusAreas).toEqual(['neck', 'hand-wrist', 'low-back', 'knee']);
    expect(mtb!.candidates.every((a) => a.category === 'strength')).toBe(true);
  });

  it('says nothing for activities without a complement rule', () => {
    expect(openComplements(['yoga'], activityCatalogue, knowledgeRules)).toEqual([]);
    expect(openComplements([], activityCatalogue, knowledgeRules)).toEqual([]);
  });

  it('matches by category or impact, not by missing data', () => {
    const jog = activityCatalogue.find((a) => a.id === 'jogging')!;
    const yoga = activityCatalogue.find((a) => a.id === 'yoga')!;
    expect(matchesSuggestion(jog, { minImpact: 'medium' })).toBe(true);
    expect(matchesSuggestion(jog, { minImpact: 'high' })).toBe(false);
    expect(matchesSuggestion(yoga, { minImpact: 'low' })).toBe(false);
    expect(matchesSuggestion(yoga, { categories: ['mobility'] })).toBe(true);
    expect(matchesSuggestion(yoga, {})).toBe(false);
  });
});

describe('deload', () => {
  it('offers a deload for strength from the lower end of the window', () => {
    const rule = deloadRuleFor('strength', knowledgeRules)!;
    expect(rule.ruleId).toBe('deload-strength');
    expect(deloadOffered(rule.everyWeeks.min - 1, rule)).toBe(false);
    expect(deloadOffered(rule.everyWeeks.min, rule)).toBe(true);
  });

  it('has no deload rule for categories without a source', () => {
    expect(deloadRuleFor('cycling', knowledgeRules)).toBeUndefined();
  });
});
