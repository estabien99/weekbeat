import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ValidationError,
  addProfile,
  getAvailability,
  getHousehold,
  setWindows,
  updateProfile,
  type Id,
  type Lang,
  type NewProfile,
  type Profile,
} from '../../core/index.ts';
import { DataCard } from '../components/DataCard.tsx';
import { AvailabilityEditor } from '../components/AvailabilityEditor.tsx';
import { ProfileFields } from '../components/ProfileFields.tsx';
import { emptyProfile } from '../profileDefaults.ts';
import { db } from '../db.ts';
import { LANGS, setLang } from '../i18n/index.ts';

type Editing = { kind: 'new' } | { kind: 'edit'; id: Id } | { kind: 'times'; id: Id } | null;

export function Settings({ profiles }: { profiles: Profile[] }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const household = useLiveQuery(() => getHousehold(db), []);
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <section aria-labelledby="settings-title" className="stack">
      <h2 id="settings-title">{t('settings.title')}</h2>

      <div className="card">
        <h3>{t('settings.app')}</h3>
        <div className="field">
          <label htmlFor="ui-lang">{t('settings.language')}</label>
          <select id="ui-lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {l === 'de' ? 'Deutsch' : 'English'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <h3>{t('settings.people', { household: household?.name ?? '' })}</h3>
        <ul className="people">
          {profiles.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <span className="muted">
                  {' · '}
                  {t(`profile.levels.${p.level}`)}
                  {p.goals[0] &&
                    ` · ${t('profile.goalSummary', { count: p.goals[0].target, kind: t(`profile.goalKinds.${p.goals[0].kind}`) })}`}
                </span>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="ghost"
                  aria-label={t('settings.editPerson', { name: p.name })}
                  onClick={() => setEditing({ kind: 'edit', id: p.id })}
                >
                  {t('settings.editPerson', { name: p.name })}
                </button>
                <button
                  type="button"
                  className="ghost"
                  aria-label={t('settings.editTimes', { name: p.name })}
                  onClick={() => setEditing({ kind: 'times', id: p.id })}
                >
                  {t('settings.editTimes', { name: p.name })}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {editing === null && (
          <button type="button" onClick={() => setEditing({ kind: 'new' })}>
            {t('settings.addPerson')}
          </button>
        )}
        {editing?.kind === 'new' && (
          <PersonForm
            title={t('settings.addPerson')}
            initial={emptyProfile(lang)}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              const p = await addProfile(db, v);
              setEditing({ kind: 'times', id: p.id });
            }}
          />
        )}
        {editing?.kind === 'edit' && (
          <PersonEdit id={editing.id} profiles={profiles} onClose={() => setEditing(null)} />
        )}
        {editing?.kind === 'times' && (
          <TimesEdit id={editing.id} profiles={profiles} onClose={() => setEditing(null)} />
        )}
      </div>

      <DataCard />
    </section>
  );
}

function PersonEdit({ id, profiles, onClose }: { id: Id; profiles: Profile[]; onClose: () => void }) {
  const { t } = useTranslation();
  const p = profiles.find((x) => x.id === id);
  if (!p) return null;
  const initial: NewProfile = {
    name: p.name,
    lang: p.lang,
    level: p.level,
    goal: p.goals[0] ?? { kind: 'sessions', target: 3 },
  };
  return (
    <PersonForm
      title={t('settings.editPerson', { name: p.name })}
      initial={initial}
      onCancel={onClose}
      onSubmit={async (v) => {
        await updateProfile(db, id, v);
        onClose();
      }}
    />
  );
}

function TimesEdit({ id, profiles, onClose }: { id: Id; profiles: Profile[]; onClose: () => void }) {
  const { t } = useTranslation();
  const p = profiles.find((x) => x.id === id);
  const availability = useLiveQuery(() => getAvailability(db, id), [id]);
  if (!p || availability === undefined) return null;
  return (
    <div className="subcard">
      <h4>{t('settings.editTimes', { name: p.name })}</h4>
      <AvailabilityEditor
        initial={availability.windows}
        saveLabel={t('common.save')}
        onSave={async (w) => {
          await setWindows(db, id, w);
          onClose();
        }}
      />
      <button type="button" className="ghost" onClick={onClose}>
        {t('common.cancel')}
      </button>
    </div>
  );
}

function PersonForm({
  title,
  initial,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial: NewProfile;
  onSubmit: (v: NewProfile) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await onSubmit(value);
    } catch (err) {
      setError(err instanceof ValidationError ? t(`errors.${err.field}`, { defaultValue: err.message }) : String(err));
    }
  };
  return (
    <form className="subcard" onSubmit={(e) => void submit(e)} noValidate>
      <h4>{title}</h4>
      <ProfileFields value={value} onChange={setValue} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit">{t('common.save')}</button>
        <button type="button" className="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
