import { describe, expect, it } from 'vitest';
import { factsFor, membershipProviders, providerById } from './providers.ts';

describe('membership providers', () => {
  it('have unique ids the core accepts', () => {
    const ids = membershipProviders.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  it('cite every fact: https source, verbatim quote, review date, text in both languages', () => {
    for (const p of membershipProviders) {
      for (const f of p.facts ?? []) {
        expect(new URL(f.source.url).protocol).toBe('https:');
        expect(f.quote.length).toBeGreaterThan(20);
        expect(f.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(f.text.de.trim()).not.toBe('');
        expect(f.text.en.trim()).not.toBe('');
      }
      for (const l of p.limits ?? []) {
        const fact = p.facts?.[l.fact];
        expect(fact).toBeDefined();
        // The number must appear in the quote it comes from.
        expect(fact!.quote).toContain(String(l.perMonth));
        expect(l.addOnOnly).toBe(fact!.addOnOnly ?? false);
      }
    }
  });

  it('show add-on facts only for linked memberships', () => {
    expect(factsFor('wellpass', false).every((f) => !f.addOnOnly)).toBe(true);
    expect(factsFor('wellpass', true).length).toBeGreaterThan(factsFor('wellpass', false).length);
    expect(factsFor('gym', true)).toEqual([]);
  });

  it('name the Wellpass Plus 1 and fall back for unknown ids', () => {
    expect(providerById('wellpass').addOn?.de).toBe('Plus 1');
    expect(providerById('some-club')).toEqual({ id: 'some-club', name: 'some-club', icon: 'other' });
  });
});
