import { describe, expect, it } from 'vitest';
import { knowledgeRules } from './index.ts';

const PARTS = ['activity-catalogue', 'weekly-targets', 'complement', 'load-recovery', 'safety'];

describe('knowledge base', () => {
  it('has unique ids', () => {
    const ids = knowledgeRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(knowledgeRules.map((r) => [r.id, r] as const))('rule %s is sourced and reviewed', (_id, r) => {
    expect(PARTS).toContain(r.part);
    expect(r.source.url).toMatch(/^https:\/\//);
    expect(r.source.title.length).toBeGreaterThan(0);
    expect(['low', 'medium', 'high']).toContain(r.confidence);
    expect(r.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(r.lastReviewed).getTime()).toBeLessThanOrEqual(Date.now());
    expect(r.summary.de.length).toBeGreaterThan(0);
    expect(r.summary.en.length).toBeGreaterThan(0);
  });
});
