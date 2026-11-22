import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ValidationError, createHousehold, setWindows, type Id, type Lang, type NewProfile } from '../../core/index.ts';
import { AvailabilityEditor } from '../components/AvailabilityEditor.tsx';
import { Interview } from '../components/Interview.tsx';
import { ProfileFields } from '../components/ProfileFields.tsx';
import { emptyProfile } from '../profileDefaults.ts';
import { db } from '../db.ts';

/** First run: household + first person, their weekly time windows, then the optional planning interview. */
export function Setup({ onStart, onDone }: { onStart: () => void; onDone: (profileId: Id) => void }) {
  const { t, i18n } = useTranslation();
  const [household, setHousehold] = useState('');
  const [person, setPerson] = useState<NewProfile>(() => emptyProfile((i18n.resolvedLanguage ?? 'de') as Lang));
  const [profileId, setProfileId] = useState<Id | null>(null);
  const [step, setStep] = useState<'availability' | 'interview'>('availability');
  const profile = useLiveQuery(() => (profileId ? db.profiles.get(profileId) : undefined), [profileId]);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    onStart();
    try {
      const { profile } = await createHousehold(db, household, person);
      setProfileId(profile.id);
      setError(null);
    } catch (err) {
      setError(err instanceof ValidationError ? t(`errors.${err.field}`, { defaultValue: err.message }) : String(err));
    }
  };

  if (profileId && step === 'interview') {
    if (!profile) return null;
    return (
      <section className="card" aria-labelledby="setup-prefs">
        <p className="step">{t('setup.step', { n: 3, of: 3 })}</p>
        <h2 id="setup-prefs">{t('setup.prefsTitle')}</h2>
        <p className="muted">{t('setup.prefsIntro')}</p>
        <Interview
          profile={profile}
          skipLabel={t('setup.skip')}
          onDone={() => onDone(profileId)}
          onSkip={() => onDone(profileId)}
        />
      </section>
    );
  }

  if (profileId) {
    return (
      <section className="card" aria-labelledby="setup-avail">
        <p className="step">{t('setup.step', { n: 2, of: 3 })}</p>
        <h2 id="setup-avail">{t('setup.availabilityTitle', { name: person.name.trim() })}</h2>
        <p className="muted">{t('setup.availabilityHint')}</p>
        <AvailabilityEditor
          initial={[]}
          saveLabel={t('common.next')}
          onSave={async (w) => {
            await setWindows(db, profileId, w);
            setStep('interview');
          }}
        />
      </section>
    );
  }

  return (
    <form className="card" onSubmit={(e) => void submit(e)} aria-labelledby="setup-title" noValidate>
      <p className="step">{t('setup.step', { n: 1, of: 3 })}</p>
      <h2 id="setup-title">{t('setup.title')}</h2>
      <p className="muted">{t('setup.intro')}</p>
      <div className="field">
        <label htmlFor="household">{t('setup.household')}</label>
        <input
          id="household"
          value={household}
          required
          placeholder={t('setup.householdPlaceholder')}
          onChange={(e) => setHousehold(e.target.value)}
        />
      </div>
      <h3>{t('setup.you')}</h3>
      <ProfileFields value={person} onChange={setPerson} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit">{t('common.next')}</button>
      <p className="muted small">{t('footer.disclaimer')}</p>
    </form>
  );
}
