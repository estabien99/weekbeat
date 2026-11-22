import { describe, expect, it } from 'vitest';
import { activityCatalogue, knowledgeRules } from '../knowledge/index.ts';
import {
  intensityOf,
  intensityThresholds,
  moderateEquivalentMinutes,
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
