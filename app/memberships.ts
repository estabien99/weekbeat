import type { TFunction } from 'i18next';
import type { Id, Lang, Membership, Profile } from '../core/index.ts';
import { providerById } from '../connectors/membership/providers.ts';

/** "Wellpass", "Eigenes Studio oder Verein", … in the UI language. */
export function providerName(id: string, t: TFunction): string {
  const p = providerById(id);
  return p.name ?? t(`membership.providers.${id}`);
}

/** "Wellpass" or "Wellpass Plus 1" (a linked membership gets the provider's add-on name or a generic one). */
export function membershipName(m: Membership, t: TFunction, lang: Lang): string {
  const base = providerName(m.provider, t);
  if (!m.linkedToMembershipId) return base;
  const addOn = providerById(m.provider).addOn?.[lang] ?? t('membership.addOnGeneric');
  return `${base} ${addOn}`;
}

/** "Wellpass Plus 1 (Sam)": unique enough to tell memberships of a household apart. */
export function membershipLabel(m: Membership, profiles: readonly Profile[], t: TFunction, lang: Lang): string {
  const owner = profiles.find((p) => p.id === m.ownerProfileId)?.name ?? '?';
  return `${membershipName(m, t, lang)} (${owner})`;
}

/** Parses an optional number field: '' → undefined, '12,50' → 12.5 (German decimal comma). */
export function optionalNumber(s: string): number | undefined {
  const v = s.trim().replace(',', '.');
  return v === '' ? undefined : Number(v);
}

export function formatEur(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

/** Form state of one membership; text fields stay strings until saved. '' provider = none chosen. */
export interface MembershipDraft {
  provider: string;
  tier: string;
  share: string;
  linkedTo: Id | '';
}

export const emptyDraft: MembershipDraft = { provider: '', tier: '', share: '', linkedTo: '' };

export function draftOf(m: Membership): MembershipDraft {
  return {
    provider: m.provider,
    tier: m.tier ?? '',
    share: m.monthlyCostShareEur === undefined ? '' : String(m.monthlyCostShareEur),
    linkedTo: m.linkedToMembershipId ?? '',
  };
}

/** Stable order for lists: main memberships before their add-ons, then by the person's order in the household. */
export function sortMemberships(all: readonly Membership[], profiles: readonly Profile[]): Membership[] {
  const person = (m: Membership) => profiles.findIndex((p) => p.id === m.ownerProfileId);
  return [...all].sort(
    (a, b) =>
      Number(Boolean(a.linkedToMembershipId)) - Number(Boolean(b.linkedToMembershipId)) ||
      person(a) - person(b) ||
      a.provider.localeCompare(b.provider) ||
      a.id.localeCompare(b.id),
  );
}
