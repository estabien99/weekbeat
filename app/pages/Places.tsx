import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ValidationError,
  addMembership,
  addPlace,
  deleteMembership,
  deletePlace,
  updateMembership,
  updatePlace,
  withLinked,
  type ActivityCategory,
  type Id,
  type Lang,
  type Membership,
  type NewMembership,
  type NewPlace,
  type Place,
  type Profile,
} from '../../core/index.ts';
import { providerById } from '../../connectors/membership/providers.ts';
import { AvailabilityEditor } from '../components/AvailabilityEditor.tsx';
import { MembershipFields } from '../components/MembershipFields.tsx';
import { ProviderIcon } from '../components/ProviderIcon.tsx';
import { db } from '../db.ts';
import { weekdayNames } from '../format.ts';
import {
  draftOf,
  emptyDraft,
  formatEur,
  membershipLabel,
  optionalNumber,
  sortMemberships,
  type MembershipDraft,
} from '../memberships.ts';

const CATEGORIES: ActivityCategory[] = ['cycling', 'endurance', 'strength', 'hiit', 'mobility', 'swimming'];
const KINDS: Place['kind'][] = ['partner', 'own', 'outdoor', 'home'];

type Editing =
  | { kind: 'membership'; id?: Id }
  | { kind: 'place'; id?: Id }
  | { kind: 'confirm-membership'; id: Id }
  | { kind: 'confirm-place'; id: Id }
  | null;

/** Turns a validation error into the translated message for its field. */
function useErrorText() {
  const { t } = useTranslation();
  return (err: unknown) =>
    err instanceof ValidationError ? t(`errors.${err.field}`, { defaultValue: err.message }) : String(err);
}

/** Toggles an id in a list. */
const toggled = (ids: Id[], id: Id, on: boolean) => (on ? [...new Set([...ids, id])] : ids.filter((x) => x !== id));

/**
 * The household's memberships and its own catalogue of places (issue #8). Everything is typed in by the people
 * themselves; nothing is copied from a provider.
 */
export function Places({ profiles, activeId }: { profiles: Profile[]; activeId: Id }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const stored = useLiveQuery(() => db.memberships.toArray(), []);
  const places = useLiveQuery(() => db.places.orderBy('id').toArray(), []);
  const [editing, setEditing] = useState<Editing>(null);
  const [status, setStatus] = useState('');
  const errorText = useErrorText();

  if (!stored || !places) return null;
  const memberships = sortMemberships(stored, profiles);
  const sortedPlaces = [...places].sort((a, b) => a.name.localeCompare(b.name, lang));
  const byId = new Map(memberships.map((m) => [m.id, m]));
  const done = (text: string) => {
    setEditing(null);
    setStatus(text);
  };

  return (
    <section aria-labelledby="places-title" className="stack">
      <h2 id="places-title">{t('places.title')}</h2>
      <p className="muted">{t('places.intro')}</p>
      <p role="status" className="ok">
        {status}
      </p>

      <div className="card">
        <h3>{t('membership.title')}</h3>
        <p className="muted small">{t('membership.works')}</p>
        {memberships.length === 0 ? (
          <p className="muted">{t('membership.none')}</p>
        ) : (
          <ul className="people">
            {memberships.map((m) => {
              const label = membershipLabel(m, profiles, t, lang);
              const main = m.linkedToMembershipId ? byId.get(m.linkedToMembershipId) : undefined;
              return (
                <li key={m.id}>
                  <div className="with-icon">
                    <ProviderIcon icon={providerById(m.provider).icon} />
                    <div>
                      <strong>{label}</strong>
                      <span className="muted">
                        {m.tier && ` · ${m.tier}`}
                        {main &&
                          ` · ${t('membership.linkedSummary', { main: membershipLabel(main, profiles, t, lang) })}`}
                        {m.monthlyCostShareEur !== undefined &&
                          ` · ${t('membership.shareSummary', { amount: formatEur(m.monthlyCostShareEur, lang) })}`}
                      </span>
                    </div>
                  </div>
                  {editing?.kind === 'confirm-membership' && editing.id === m.id ? (
                    <Confirm
                      text={t('membership.confirmRemove', { label })}
                      onYes={async () => {
                        await deleteMembership(db, m.id);
                        done(t('common.removed', { name: label }));
                      }}
                      onNo={() => setEditing(null)}
                    />
                  ) : (
                    <div className="actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setEditing({ kind: 'membership', id: m.id })}
                      >
                        {t('common.editNamed', { name: label })}
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setEditing({ kind: 'confirm-membership', id: m.id })}
                      >
                        {t('common.removeNamed', { name: label })}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {editing?.kind === 'membership' ? (
          <MembershipForm
            key={editing.id ?? 'new'}
            existing={editing.id ? byId.get(editing.id) : undefined}
            memberships={memberships}
            profiles={profiles}
            activeId={activeId}
            errorText={errorText}
            onCancel={() => setEditing(null)}
            onSaved={() => done(t('common.saved'))}
          />
        ) : (
          <button type="button" onClick={() => setEditing({ kind: 'membership' })}>
            {t('membership.add')}
          </button>
        )}
      </div>

      <div className="card">
        <h3>{t('places.listTitle')}</h3>
        {sortedPlaces.length === 0 ? (
          <p className="muted">{t('places.none')}</p>
        ) : (
          <ul className="places">
            {sortedPlaces.map((p) => (
              <li key={p.id}>
                <PlaceSummary place={p} memberships={memberships} profiles={profiles} />
                {editing?.kind === 'confirm-place' && editing.id === p.id ? (
                  <Confirm
                    text={t('places.confirmRemove', { name: p.name })}
                    onYes={async () => {
                      await deletePlace(db, p.id);
                      done(t('common.removed', { name: p.name }));
                    }}
                    onNo={() => setEditing(null)}
                  />
                ) : (
                  <div className="actions">
                    {p.bookingUrl && (
                      <a className="button ghost" href={p.bookingUrl} target="_blank" rel="noopener noreferrer">
                        {t('places.book', { name: p.name })}
                        <span className="sr-only"> {t('common.newTab')}</span>
                      </a>
                    )}
                    <button type="button" className="ghost" onClick={() => setEditing({ kind: 'place', id: p.id })}>
                      {t('common.editNamed', { name: p.name })}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setEditing({ kind: 'confirm-place', id: p.id })}
                    >
                      {t('common.removeNamed', { name: p.name })}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {editing?.kind === 'place' ? (
          <PlaceForm
            key={editing.id ?? 'new'}
            existing={editing.id ? places.find((p) => p.id === editing.id) : undefined}
            memberships={memberships}
            profiles={profiles}
            errorText={errorText}
            onCancel={() => setEditing(null)}
            onSaved={() => done(t('common.saved'))}
          />
        ) : (
          <button type="button" onClick={() => setEditing({ kind: 'place' })}>
            {t('places.add')}
          </button>
        )}
      </div>
    </section>
  );
}

function Confirm({ text, onYes, onNo }: { text: string; onYes: () => Promise<void>; onNo: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="confirm">
      <p ref={ref} tabIndex={-1}>
        {text}
      </p>
      <div className="actions">
        <button type="button" onClick={() => void onYes()}>
          {t('common.removeConfirm')}
        </button>
        <button type="button" className="ghost" onClick={onNo}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

function PlaceSummary({
  place,
  memberships,
  profiles,
}: {
  place: Place;
  memberships: Membership[];
  profiles: Profile[];
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const days = weekdayNames(lang, 'short');
  const covered = memberships
    .filter((m) => place.membershipIds.includes(m.id))
    .map((m) => membershipLabel(m, profiles, t, lang));
  return (
    <div>
      <strong>{place.name}</strong>
      <span className="muted">
        {' · '}
        {t(`places.kinds.${place.kind}`)}
        {place.travelMin !== undefined && ` · ${t('places.travelSummary', { count: place.travelMin })}`}
        {place.singleVisitPriceEur !== undefined &&
          ` · ${t('places.priceSummary', { amount: formatEur(place.singleVisitPriceEur, lang) })}`}
      </span>
      {covered.length > 0 && <p className="small">{t('places.coveredSummary', { list: covered.join(', ') })}</p>}
      {place.categories.length > 0 && (
        <p className="small muted">
          {place.categories.map((c) => t(`activityCategories.${c}`, { defaultValue: c })).join(', ')}
          {place.equipment.length > 0 && ` · ${place.equipment.join(', ')}`}
        </p>
      )}
      {place.openingHours && (
        <p className="small muted">
          {place.openingHours.map((w) => `${days[w.day - 1]} ${w.from}–${w.to}`).join(', ')}
        </p>
      )}
    </div>
  );
}

function FormHeading({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  // Opening a form moves focus to it, so keyboard and screen reader users land on the new fields.
  useEffect(() => ref.current?.focus(), []);
  return (
    <h4 ref={ref} tabIndex={-1}>
      {children}
    </h4>
  );
}

function MembershipForm({
  existing,
  memberships,
  profiles,
  activeId,
  errorText,
  onCancel,
  onSaved,
}: {
  existing?: Membership;
  memberships: Membership[];
  profiles: Profile[];
  activeId: Id;
  errorText: (err: unknown) => string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const id = useId();
  const [owner, setOwner] = useState<Id>(existing?.ownerProfileId ?? activeId);
  const [draft, setDraft] = useState<MembershipDraft>(existing ? draftOf(existing) : emptyDraft);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const m: NewMembership = {
      provider: draft.provider,
      ownerProfileId: owner,
      tier: draft.tier,
      monthlyCostShareEur: optionalNumber(draft.share),
      ...(draft.linkedTo ? { linkedToMembershipId: draft.linkedTo } : {}),
    };
    try {
      if (existing) await updateMembership(db, existing.id, m);
      else await addMembership(db, m);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <form className="subcard" onSubmit={(e) => void submit(e)} noValidate>
      <FormHeading>
        {existing ? t('common.editNamed', { name: membershipLabel(existing, profiles, t, lang) }) : t('membership.add')}
      </FormHeading>
      {profiles.length > 1 && (
        <div className="field">
          <label htmlFor={`${id}-owner`}>{t('membership.owner')}</label>
          <select
            id={`${id}-owner`}
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              setDraft({ ...draft, linkedTo: '' });
            }}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <MembershipFields
        value={draft}
        onChange={setDraft}
        ownerId={owner}
        selfId={existing?.id}
        memberships={memberships}
        profiles={profiles}
      />
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

interface PlaceDraft {
  name: string;
  kind: Place['kind'];
  membershipIds: Id[];
  categories: string[];
  equipment: string;
  openingHours: Place['openingHours'];
  address: string;
  bookingUrl: string;
  price: string;
  travel: string;
}

function placeDraft(p?: Place): PlaceDraft {
  return {
    name: p?.name ?? '',
    kind: p?.kind ?? 'partner',
    membershipIds: p?.membershipIds ?? [],
    categories: p?.categories ?? [],
    equipment: p?.equipment.join(', ') ?? '',
    openingHours: p?.openingHours ?? [],
    address: p?.address ?? '',
    bookingUrl: p?.bookingUrl ?? '',
    price: p?.singleVisitPriceEur === undefined ? '' : String(p.singleVisitPriceEur),
    travel: p?.travelMin === undefined ? '' : String(p.travelMin),
  };
}

function PlaceForm({
  existing,
  memberships,
  profiles,
  errorText,
  onCancel,
  onSaved,
}: {
  existing?: Place;
  memberships: Membership[];
  profiles: Profile[];
  errorText: (err: unknown) => string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const id = useId();
  const [d, setD] = useState<PlaceDraft>(() => placeDraft(existing));
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<PlaceDraft>) => setD((prev) => ({ ...prev, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const p: NewPlace = {
      name: d.name,
      kind: d.kind,
      membershipIds: d.membershipIds,
      categories: d.categories,
      equipment: d.equipment.split(','),
      openingHours: d.openingHours,
      address: d.address,
      bookingUrl: d.bookingUrl,
      singleVisitPriceEur: optionalNumber(d.price),
      travelMin: optionalNumber(d.travel),
    };
    try {
      if (existing) await updatePlace(db, existing.id, p);
      else await addPlace(db, p);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <form className="subcard" onSubmit={(e) => void submit(e)} noValidate>
      <FormHeading>{existing ? t('common.editNamed', { name: existing.name }) : t('places.add')}</FormHeading>
      <div className="field">
        <label htmlFor={`${id}-name`}>{t('places.name')}</label>
        <input
          id={`${id}-name`}
          value={d.name}
          required
          autoComplete="off"
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-kind`}>{t('places.kind')}</label>
        <select id={`${id}-kind`} value={d.kind} onChange={(e) => set({ kind: e.target.value as Place['kind'] })}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`places.kinds.${k}`)}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="choices" aria-describedby={`${id}-covered-hint`}>
        <legend>{t('places.coveredBy')}</legend>
        <p className="muted small" id={`${id}-covered-hint`}>
          {memberships.length === 0 ? t('places.noMemberships') : t('places.coveredHint')}
        </p>
        {memberships.map((m) => (
          <label key={m.id} className="choice">
            <input
              type="checkbox"
              checked={d.membershipIds.includes(m.id)}
              onChange={(e) =>
                set({
                  // Ticking a main membership also ticks its Plus 1; each can be unticked on its own.
                  membershipIds: e.target.checked
                    ? [...new Set([...d.membershipIds, ...withLinked([m.id], memberships)])]
                    : toggled(d.membershipIds, m.id, false),
                })
              }
            />
            <span>{membershipLabel(m, profiles, t, lang)}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="choices">
        <legend>{t('places.categories')}</legend>
        {CATEGORIES.map((c) => (
          <label key={c} className="choice">
            <input
              type="checkbox"
              checked={d.categories.includes(c)}
              onChange={(e) => set({ categories: toggled(d.categories, c, e.target.checked) })}
            />
            <span>{t(`activityCategories.${c}`)}</span>
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-equipment`}>{t('places.equipment')}</label>
        <input
          id={`${id}-equipment`}
          value={d.equipment}
          autoComplete="off"
          aria-describedby={`${id}-equipment-hint`}
          onChange={(e) => set({ equipment: e.target.value })}
        />
        <p className="muted small" id={`${id}-equipment-hint`}>
          {t('places.equipmentHint')}
        </p>
      </div>

      <fieldset className="field">
        <legend>{t('places.hours')}</legend>
        <AvailabilityEditor
          initial={d.openingHours ?? []}
          onChange={(w) => set({ openingHours: w })}
          emptyText={t('places.hoursNone')}
          addLegend={t('places.hoursAdd')}
        />
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-price`}>{t('places.price')}</label>
        <input
          id={`${id}-price`}
          inputMode="decimal"
          autoComplete="off"
          aria-describedby={`${id}-price-hint`}
          value={d.price}
          onChange={(e) => set({ price: e.target.value })}
        />
        <p className="muted small" id={`${id}-price-hint`}>
          {t('places.priceHint')}
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${id}-travel`}>{t('places.travel')}</label>
        <input
          id={`${id}-travel`}
          inputMode="numeric"
          autoComplete="off"
          value={d.travel}
          onChange={(e) => set({ travel: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-address`}>{t('places.address')}</label>
        <input
          id={`${id}-address`}
          value={d.address}
          autoComplete="street-address"
          onChange={(e) => set({ address: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-url`}>{t('places.bookingUrl')}</label>
        <input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          value={d.bookingUrl}
          onChange={(e) => set({ bookingUrl: e.target.value })}
        />
      </div>

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
