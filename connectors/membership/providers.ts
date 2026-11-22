import type { I18nText } from '../../core/index.ts';

/**
 * Membership providers the person can pick (concept doc → "Connectors", issue #8). All of them work the same way:
 * memberships, places and check-ins are entered by hand, because no provider offers a member API (the EGYM
 * Wellpass APIs are for studios and booking platforms: https://developer.egym.com/wellpass/admission/overview).
 *
 * Only facts go here, no guesses: names are used descriptively ("works with Wellpass"), no logos (decided
 * 22.11.2026: neutral icons until a provider's brand guidelines allow more), and no prices, tiers or check-in
 * limits — those differ by plan and country and are entered by the person. `addOn` names the linked membership a
 * provider offers, where we know it (Wellpass Plus 1: concept doc, from the user).
 */
export interface MembershipProvider {
  id: string;
  /** Proper name, the same in every language; `null` for the generic entries (named through i18n). */
  name: string | null;
  /** Picks the neutral icon: a pass for many partners, a single gym or club, anything else. */
  icon: 'pass' | 'gym' | 'other';
  /** Name of a linked add-on membership, e.g. Plus 1. Generic wording is used where it is not set. */
  addOn?: I18nText;
}

export const membershipProviders: readonly MembershipProvider[] = [
  { id: 'wellpass', name: 'Wellpass', icon: 'pass', addOn: { de: 'Plus 1', en: 'Plus 1' } },
  { id: 'urban-sports-club', name: 'Urban Sports Club', icon: 'pass' },
  { id: 'wellhub', name: 'Wellhub', icon: 'pass' },
  { id: 'gym', name: null, icon: 'gym' },
  { id: 'other', name: null, icon: 'other' },
];

export function providerById(id: string): MembershipProvider {
  return membershipProviders.find((p) => p.id === id) ?? { id, name: id, icon: 'other' };
}
