import { describe, expect, it } from 'vitest';
import { membershipProviders, providerById } from './providers.ts';

describe('membership providers', () => {
  it('have unique ids the core accepts', () => {
    const ids = membershipProviders.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  it('name the Wellpass Plus 1 and fall back for unknown ids', () => {
    expect(providerById('wellpass').addOn?.de).toBe('Plus 1');
    expect(providerById('some-club')).toEqual({ id: 'some-club', name: 'some-club', icon: 'other' });
  });
});
