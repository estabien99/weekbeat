import type { MembershipProvider } from '../../connectors/membership/providers.ts';

/**
 * Neutral icon per provider kind (no provider logos, decided 22.11.2026). Decorative: the name is always shown
 * next to it, so it is hidden from assistive technology.
 */
export function ProviderIcon({ icon }: { icon: MembershipProvider['icon'] }) {
  return (
    <svg className="provider-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      {icon === 'pass' && (
        // A membership card with a stripe: one pass for many partners.
        <>
          <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 10h18M7 15h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {icon === 'gym' && (
        // A dumbbell: one gym or club.
        <path
          d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
      {icon === 'other' && (
        // A tag: any other membership.
        <>
          <path
            d="M4 12.5V5h7.5L20 13.5 13.5 20z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="9" r="1.4" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
