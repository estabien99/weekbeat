import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ValidationError,
  addMembership,
  deleteMembership,
  deleteProgramme,
  saveProgramme,
  savePreferences,
  updateMembership,
  type ActivityCategory,
  type Lang,
  type Preferences,
  type Profile,
} from '../../core/index.ts';
import { activityCatalogue } from '../../knowledge/index.ts';
import { db } from '../db.ts';
import { draftOf, emptyDraft, membershipOf, optionalNumber, type MembershipDraft } from '../memberships.ts';
import { COACH_ID, coachProgramme } from '../../connectors/freeletics-coach/coach.ts';
import { coachDraftError, coachDraftOf, type CoachDraft } from '../coach.ts';
import { CoachFields } from './CoachFields.tsx';
import { MembershipFields } from './MembershipFields.tsx';

const CATEGORIES: ActivityCategory[] = ['cycling', 'endurance', 'strength', 'hiit', 'mobility', 'swimming'];
const STEPS = ['hobbies', 'length', 'membership', 'coach', 'auto'] as const;

/**
 * Optional planning interview: what the person likes to do, how long a session usually is, their membership (the
 * first one; more are managed under "Orte"), their Freeletics Coach plan and whether Weekbeat proposes the week by
 * itself. Used in setup (skippable) and in settings (to change the answers).
 */
export function Interview({
  profile,
  onDone,
  onSkip,
  skipLabel,
}: {
  profile: Profile;
  onDone: () => void;
  /** Leaves without saving. */
  onSkip: () => void;
  skipLabel: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<Preferences>({
    hobbies: profile.hobbies,
    sessionMin: profile.preferredSessionMin,
    autoPlan: profile.autoPlan ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const memberships = useLiveQuery(() => db.memberships.toArray(), []);
  const profiles = useLiveQuery(() => db.profiles.toArray(), []);
  const existing = memberships?.find((m) => m.ownerProfileId === profile.id);
  // Until the person changes it, the answer is their current membership (or none).
  const [edited, setMembership] = useState<MembershipDraft | null>(null);
  const membership: MembershipDraft | null =
    edited ?? (memberships ? (existing ? draftOf(existing) : emptyDraft) : null);
  const places = useLiveQuery(() => db.places.toArray(), []);
  const programmes = useLiveQuery(() => db.programmes.where('profileId').equals(profile.id).toArray(), [profile.id]);
  const existingCoach = programmes?.find((p) => p.connectorId === COACH_ID);
  const [editedCoach, setCoach] = useState<CoachDraft | null>(null);
  const coach: CoachDraft | null = editedCoach ?? (programmes ? coachDraftOf(existingCoach, prefs.sessionMin) : null);
  const [invalid, setInvalid] = useState<string | undefined>();

  // Move focus to the new question so screen reader and keyboard users start there.
  useEffect(() => heading.current?.focus(), [step]);

  const toggle = (activityId: string, on: boolean) =>
    setPrefs((p) => ({ ...p, hobbies: on ? [...p.hobbies, activityId] : p.hobbies.filter((h) => h !== activityId) }));

  const next = async () => {
    setError(null);
    if (step < STEPS.length - 1) {
      if (
        STEPS[step] === 'length' &&
        prefs.sessionMin !== undefined &&
        !(Number.isInteger(prefs.sessionMin) && prefs.sessionMin >= 1)
      ) {
        setError(t('errors.sessionMin'));
        return;
      }
      if (STEPS[step] === 'coach' && coach) {
        const field = coachDraftError(coach);
        setInvalid(field);
        if (field) {
          setError(t(`errors.${field}`));
          return;
        }
      }
      if (STEPS[step] === 'membership' && membership && membership.provider !== '') {
        const share = optionalNumber(membership.share);
        if (share !== undefined && !(Number.isFinite(share) && share >= 0)) {
          setError(t('errors.monthlyCostShareEur'));
          return;
        }
      }
      setStep(step + 1);
      return;
    }
    try {
      await savePreferences(db, profile.id, prefs);
      await saveMembership();
      await saveCoach();
      onDone();
    } catch (err) {
      setError(err instanceof ValidationError ? t(`errors.${err.field}`, { defaultValue: err.message }) : String(err));
    }
  };

  /** Adds, changes or removes the person's (first) membership as answered. */
  const saveMembership = async () => {
    if (!membership) return;
    if (membership.provider === '') {
      if (existing) await deleteMembership(db, existing.id);
      return;
    }
    // The interview does not show limits: keep what was entered elsewhere.
    const m = {
      ...membershipOf(membership, profile.id),
      dailyCheckInLimit: existing?.dailyCheckInLimit,
      monthlyCheckInLimit: existing?.monthlyCheckInLimit,
    };
    if (existing) await updateMembership(db, existing.id, m);
    else await addMembership(db, m);
  };

  /** Saves, changes or removes the person's Coach plan as answered. */
  const saveCoach = async () => {
    if (!coach) return;
    if (!coach.use) {
      if (existingCoach) await deleteProgramme(db, existingCoach.id);
      return;
    }
    await saveProgramme(
      db,
      coachProgramme(profile.id, {
        daysPerWeek: Number(coach.daysPerWeek),
        durationMin: Number(coach.durationMin),
        kind: coach.kind,
        // Only places that still exist (one may have been deleted under "Orte" meanwhile).
        weightPlaceIds:
          coach.kind === 'bodyweight' ? [] : coach.weightPlaceIds.filter((id) => places?.some((p) => p.id === id)),
        weekdays: coach.weekdays,
      }),
    );
  };

  const current = STEPS[step]!;
  return (
    <form
      className="interview"
      aria-labelledby={`${id}-q`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void next();
      }}
    >
      <p className="step">{t('interview.progress', { n: step + 1, of: STEPS.length })}</p>
      <h3 id={`${id}-q`} ref={heading} tabIndex={-1}>
        {t(`interview.${current}.title`, { name: profile.name })}
      </h3>
      <p className="muted" id={`${id}-hint`}>
        {t(`interview.${current}.hint`)}
      </p>

      {current === 'hobbies' &&
        CATEGORIES.map((cat) => (
          <fieldset key={cat} className="choices" aria-describedby={`${id}-hint`}>
            <legend>{t(`activityCategories.${cat}`)}</legend>
            {activityCatalogue
              .filter((a) => a.category === cat)
              .sort((a, b) => a.name[lang].localeCompare(b.name[lang], lang))
              .map((a) => (
                <label key={a.id} className="choice">
                  <input
                    type="checkbox"
                    checked={prefs.hobbies.includes(a.id)}
                    onChange={(e) => toggle(a.id, e.target.checked)}
                  />
                  <span>{a.name[lang]}</span>
                </label>
              ))}
          </fieldset>
        ))}

      {current === 'length' && (
        <div className="field">
          <label htmlFor={`${id}-len`}>{t('profile.sessionMin')}</label>
          <input
            id={`${id}-len`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            aria-describedby={`${id}-hint`}
            aria-invalid={error ? true : undefined}
            value={prefs.sessionMin ?? ''}
            onChange={(e) =>
              setPrefs({ ...prefs, sessionMin: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </div>
      )}

      {current === 'membership' && membership && memberships && profiles && (
        <MembershipFields
          value={membership}
          onChange={(v) => {
            setMembership(v);
            setError(null);
          }}
          ownerId={profile.id}
          selfId={existing?.id}
          memberships={memberships}
          profiles={profiles}
          noneLabel={t('interview.membership.none')}
          describedBy={`${id}-hint`}
          showLimits={false}
        />
      )}

      {current === 'coach' && coach && places && (
        <CoachFields
          value={coach}
          onChange={(v) => {
            setCoach(v);
            setError(null);
            setInvalid(undefined);
          }}
          places={places}
          idPrefix={`${id}-coach`}
          describedBy={`${id}-hint`}
          invalid={invalid}
        />
      )}

      {current === 'auto' && (
        <fieldset className="choices" aria-describedby={`${id}-hint`}>
          <legend className="sr-only">{t('interview.auto.title', { name: profile.name })}</legend>
          {([true, false] as const).map((on) => (
            <label key={String(on)} className="choice">
              <input
                type="radio"
                name={`${id}-auto`}
                checked={prefs.autoPlan === on}
                onChange={() => setPrefs({ ...prefs, autoPlan: on })}
              />
              <span>{t(on ? 'interview.auto.yes' : 'interview.auto.no')}</span>
            </label>
          ))}
        </fieldset>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit">{step < STEPS.length - 1 ? t('common.next') : t('interview.finish')}</button>
        {step > 0 && (
          <button type="button" className="ghost" onClick={() => setStep(step - 1)}>
            {t('common.back')}
          </button>
        )}
        <button type="button" className="ghost" onClick={onSkip}>
          {skipLabel}
        </button>
      </div>
    </form>
  );
}
