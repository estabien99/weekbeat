import type { TFunction } from 'i18next';
import type { Id, Lang, Membership, NewMembership, Profile } from '../core/index.ts';
import { providerById, type ProviderLimit } from '../connectors/membership/providers.ts';

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
  daily: string;
  monthly: string;
}

export const emptyDraft: MembershipDraft = {
  provider: '',
  tier: '',
  share: '',
  linkedTo: '',
  daily: '',
  monthly: '',
};

export function draftOf(m: Membership): MembershipDraft {
  return {
    provider: m.provider,
    tier: m.tier ?? '',
    share: m.monthlyCostShareEur === undefined ? '' : String(m.monthlyCostShareEur),
    linkedTo: m.linkedToMembershipId ?? '',
    daily: m.dailyCheckInLimit === undefined ? '' : String(m.dailyCheckInLimit),
    monthly: m.monthlyCheckInLimit === undefined ? '' : String(m.monthlyCheckInLimit),
  };
}

/** The membership a filled-in draft describes (the core validates it). */
export function membershipOf(d: MembershipDraft, ownerProfileId: Id): NewMembership {
  return {
    provider: d.provider,
    ownerProfileId,
    tier: d.tier,
    monthlyCostShareEur: optionalNumber(d.share),
    dailyCheckInLimit: optionalNumber(d.daily),
    monthlyCheckInLimit: optionalNumber(d.monthly),
    ...(d.linkedTo ? { linkedToMembershipId: d.linkedTo } : {}),
  };
}

/** The limit the provider states for this kind of membership (e.g. the Wellpass Plus 1 limit from 2027). */
export function providerLimit(provider: string, linked: boolean): ProviderLimit | undefined {
  return providerById(provider).limits?.find((l) => !l.addOnOnly || linked);
}

/**
 * Memberships as the planner should see them: where the person left the monthly limit empty, the provider's
 * stated limit applies from its start date. What the person entered always wins.
 */
export function withProviderLimits(all: readonly Membership[]): Membership[] {
  return all.map((m) => {
    if (m.monthlyCheckInLimit !== undefined) return m;
    const l = providerLimit(m.provider, Boolean(m.linkedToMembershipId));
    return l ? { ...m, monthlyCheckInLimit: l.perMonth, monthlyCheckInLimitFrom: l.from } : m;
  });
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
