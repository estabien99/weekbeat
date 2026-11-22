import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Id, Lang, Membership, Profile } from '../../core/index.ts';
import { membershipProviders, providerById } from '../../connectors/membership/providers.ts';
import { membershipLabel, providerName, type MembershipDraft } from '../memberships.ts';

/**
 * Controlled fields for one membership of `ownerId`; the parent owns the form and submit. `noneLabel` adds a
 * "no membership" choice (interview); otherwise a provider must be picked.
 */
export function MembershipFields({
  value,
  onChange,
  ownerId,
  selfId,
  memberships,
  profiles,
  noneLabel,
  describedBy,
}: {
  value: MembershipDraft;
  onChange: (v: MembershipDraft) => void;
  ownerId: Id;
  selfId?: Id;
  memberships: readonly Membership[];
  profiles: readonly Profile[];
  noneLabel?: string;
  describedBy?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const id = useId();
  // A linked membership (e.g. Plus 1) hangs off a main membership of the same provider that someone else holds.
  const mains = memberships.filter(
    (m) => m.provider === value.provider && !m.linkedToMembershipId && m.id !== selfId && m.ownerProfileId !== ownerId,
  );
  const addOn = providerById(value.provider).addOn?.[lang] ?? t('membership.addOnGeneric');

  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-provider`}>{t('membership.provider')}</label>
        <select
          id={`${id}-provider`}
          value={value.provider}
          aria-describedby={describedBy}
          onChange={(e) => onChange({ ...value, provider: e.target.value, linkedTo: '' })}
        >
          <option value="">{noneLabel ?? t('membership.choose')}</option>
          {membershipProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {providerName(p.id, t)}
            </option>
          ))}
        </select>
      </div>
      {value.provider !== '' && (
        <>
          {mains.length > 0 && (
            <div className="field">
              <label htmlFor={`${id}-linked`}>{t('membership.linkedTo', { addOn })}</label>
              <select
                id={`${id}-linked`}
                value={value.linkedTo}
                onChange={(e) => onChange({ ...value, linkedTo: e.target.value })}
              >
                <option value="">{t('membership.linkedNone')}</option>
                {mains.map((m) => (
                  <option key={m.id} value={m.id}>
                    {membershipLabel(m, profiles, t, lang)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor={`${id}-tier`}>{t('membership.tier')}</label>
            <input
              id={`${id}-tier`}
              value={value.tier}
              autoComplete="off"
              onChange={(e) => onChange({ ...value, tier: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-share`}>{t('membership.share')}</label>
            <input
              id={`${id}-share`}
              inputMode="decimal"
              autoComplete="off"
              aria-describedby={`${id}-share-hint`}
              value={value.share}
              onChange={(e) => onChange({ ...value, share: e.target.value })}
            />
            <p className="muted small" id={`${id}-share-hint`}>
              {t('membership.shareHint')}
            </p>
          </div>
        </>
      )}
    </>
  );
}
