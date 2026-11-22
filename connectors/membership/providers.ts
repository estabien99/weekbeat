import type { I18nText, Source } from '../../core/index.ts';

/**
 * Membership providers the person can pick (concept doc → "Connectors", issue #8). All of them work the same way:
 * memberships, places and check-ins are entered by hand, because no provider offers a member API (the EGYM
 * Wellpass APIs are for studios and booking platforms: https://developer.egym.com/wellpass/admission/overview).
 *
 * Only sourced facts go here: names are used descriptively ("works with Wellpass"), no logos (decided 22.11.2026:
 * neutral icons until a provider's brand guidelines allow more), no prices. Each fact quotes the provider's own
 * pages (`source`, `quote`, `lastReviewed`); `providers.test.ts` enforces that. Facts that differ by plan or city
 * (e.g. Urban Sports Club plans) are shown as hints, never applied automatically: the person enters their own plan.
 */
export interface ProviderFact {
  /** Shown in the membership form, German first. */
  text: I18nText;
  /** Verbatim sentence(s) from the source. */
  quote: string;
  source: Source;
  lastReviewed: string;
  /** For linked add-on memberships (e.g. Plus 1) only. */
  addOnOnly?: boolean;
}

/** A check-in limit stated by the provider for every membership of a kind (not per plan or city). */
export interface ProviderLimit {
  /** Maximum on-site check-ins per calendar month. */
  perMonth: number;
  /** First day the limit applies (ISO date). */
  from: string;
  addOnOnly: boolean;
  /** Index into `facts` of the fact that states it. */
  fact: number;
}

export interface MembershipProvider {
  id: string;
  /** Proper name, the same in every language; `null` for the generic entries (named through i18n). */
  name: string | null;
  /** Picks the neutral icon: a pass for many partners, a single gym or club, anything else. */
  icon: 'pass' | 'gym' | 'other';
  /** Name of a linked add-on membership, e.g. Plus 1. Generic wording is used where it is not set. */
  addOn?: I18nText;
  facts?: ProviderFact[];
  limits?: ProviderLimit[];
}

const WELLPASS_PLUS1: Source = {
  title: 'EGYM Wellpass Help Center: What is the Plus1 membership and who is eligible to join?',
  url: 'https://support.egym-wellpass.com/en/articles/10853223-plus1-membership',
};
const WELLPASS_PLUS1_LIMIT: Source = {
  title: 'EGYM Wellpass Help Center: Plus1 Membership – Check-in Limit – Q&A',
  url: 'https://support.egym-wellpass.com/en/articles/16596389-plus1-membership-check-in-limit-q-a',
};

export const membershipProviders: readonly MembershipProvider[] = [
  {
    id: 'wellpass',
    name: 'Wellpass',
    icon: 'pass',
    addOn: { de: 'Plus 1', en: 'Plus 1' },
    facts: [
      {
        text: {
          de: 'Check-in vor Ort in der Wellpass-App, per Standort oder (noch) per QR-Code.',
          en: 'Check in on site in the Wellpass app, by location or (for now) by QR code.',
        },
        quote:
          'Open the Wellpass app and tap the "Check-in" tab at the bottom. […] As long as you are still able to scan a QR code, this check-in method remains valid.',
        source: {
          title: 'EGYM Wellpass Help Center: Smart Check-in via GPS',
          url: 'https://support.egym-wellpass.com/en/articles/13341328-smart-check-in-via-gps',
        },
        lastReviewed: '2026-11-22',
      },
      {
        text: {
          de: 'Plus 1 ist ein eigenes Konto und gilt in etwa 90 % der Studios; im Studioprofil steht „Accessible to Plus1 members“. Hake Plus 1 nur bei diesen Orten an.',
          en: 'Plus 1 is a separate account and works at about 90% of studios; the studio profile says “Accessible to Plus1 members”. Tick Plus 1 only at those places.',
        },
        quote:
          'Plus1 members can check in at approximately 90% of the studios. […] In the studio profile, you’ll always see the note “Accessible to Plus1 members.”',
        source: WELLPASS_PLUS1,
        lastReviewed: '2026-11-22',
        addOnOnly: true,
      },
      {
        text: {
          de: 'Ab 1. Januar 2027 höchstens 10 Check-ins vor Ort pro Kalendermonat; über die App gebuchte Kurse zählen mit, Online-Angebote nicht. Ungenutzte Check-ins verfallen am Monatsende.',
          en: 'From 1 January 2027 at most 10 on-site check-ins per calendar month; classes booked in the app count, online offers do not. Unused check-ins expire at the end of the month.',
        },
        quote:
          'As of January 1, 2027, a monthly limit of 10 on-site check-ins will apply to all Plus1 memberships. […] Each successful on-site visit to a partner facility as well as each confirmed class booking via the Wellpass app deducts 1 check-in from your monthly allowance. […] Live online classes, partner apps, and on-demand workouts do not count toward your 10 monthly on-site check-ins.',
        source: WELLPASS_PLUS1_LIMIT,
        lastReviewed: '2026-11-22',
        addOnOnly: true,
      },
    ],
    limits: [{ perMonth: 10, from: '2027-01-01', addOnOnly: true, fact: 2 }],
  },
  {
    id: 'urban-sports-club',
    name: 'Urban Sports Club',
    icon: 'pass',
    facts: [
      {
        text: {
          de: 'Je nach Tarif ein Monatslimit (z. B. Essential: 8 Check-ins) oder 1 Check-in pro Tag; dazu hat jeder Ort eigene Besuchslimits. Tarife unterscheiden sich je Stadt: trag dein Limit selbst ein.',
          en: 'Depending on the plan, a monthly limit (e.g. Essential: 8 check-ins) or 1 check-in per day; each venue also has its own visit limits. Plans differ by city: enter your own limit.',
        },
        quote:
          'Essential Membership — Monthly limit 8 | Classic Membership — Monthly limit Unlimited (1x check-in per day) | Venues have their own check-in limits, regardless of the plan-specific limits.',
        source: { title: 'Urban Sports Club: Prices (Munich)', url: 'https://urbansportsclub.com/en/prices/munchen' },
        lastReviewed: '2026-11-22',
      },
    ],
  },
  {
    id: 'wellhub',
    name: 'Wellhub',
    icon: 'pass',
    facts: [
      {
        text: {
          de: 'Check-in in der Wellhub-App am Ort; das Studio bestätigt ihn. Limits je Tarif: bitte in deiner App nachsehen.',
          en: 'Check in with the Wellhub app on site; the studio confirms it. Limits per plan: please check your app.',
        },
        quote:
          'Der Check-in umfasst zwei Aktionen: Das Mitglied initiiert ihn in der Wellhub-App, und Sie bestätigen ihn im Partnerportal.',
        source: {
          title: 'Wellhub Partner Academy: Wie der Check-in-Prozess funktioniert',
          url: 'https://wellhub.com/de-de/partner-academy/check-in-prozess/',
        },
        lastReviewed: '2026-11-22',
      },
    ],
  },
  { id: 'gym', name: null, icon: 'gym' },
  { id: 'other', name: null, icon: 'other' },
];

export function providerById(id: string): MembershipProvider {
  return membershipProviders.find((p) => p.id === id) ?? { id, name: id, icon: 'other' };
}

/** The facts to show for a main membership or for a linked add-on (which sees both kinds). */
export function factsFor(providerId: string, linked: boolean): ProviderFact[] {
  return (providerById(providerId).facts ?? []).filter((f) => linked || !f.addOnOnly);
}
