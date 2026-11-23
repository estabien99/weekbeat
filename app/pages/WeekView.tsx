import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  acceptSessions,
  applyReplan,
  completeSession,
  getAvailability,
  healthHold,
  isoWeek,
  isoWeekday,
  mergedSessions,
  sessionOfPlanned,
  planWeek,
  replan,
  toIsoDate,
  toggleRestDay,
  weekOf,
  type Lang,
  type PlannedSession,
  type Profile,
  type ReplanOffer,
} from '../../core/index.ts';
import { COACH_ACTIVITY, COACH_ID, COACH_NAME, coachChecklist } from '../../connectors/freeletics-coach/coach.ts';
import { activityCatalogue } from '../../knowledge/index.ts';
import { GameCard } from '../components/GameCard.tsx';
import { HouseholdWeek } from '../components/HouseholdWeek.tsx';
import { ManualLogForm } from '../components/ManualLogForm.tsx';
import { WeekReview } from '../components/WeekReview.tsx';
import { useDateText } from '../useDateText.ts';
import { db } from '../db.ts';
import { localeOf, weekdayNames } from '../format.ts';
import { membershipLabel } from '../memberships.ts';
import { loadPlanInput } from '../planInput.ts';

const HIDDEN = new Set(['moved', 'skipped']);
const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const localIso = (d: Date) => `${toIsoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function endOf(s: PlannedSession): string {
  const [h = 0, m = 0] = s.start.slice(11, 16).split(':').map(Number);
  const end = h * 60 + m + s.durationMin;
  return `${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`;
}

interface Replanning {
  session: PlannedSession;
  reason: 'missed' | 'moved';
  offers: ReplanOffer[];
}

/**
 * The week: free windows, planned sessions and, on request or automatically (interview setting), the planner's
 * proposal. Nothing is saved until the person accepts it; missed or moved sessions get replan offers.
 */
export function WeekView({ profile }: { profile: Profile }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'de') as Lang;
  const locale = localeOf(lang);
  const now = new Date();
  const nowIso = localIso(now);
  const today = toIsoDate(now);
  // On Sundays the automatic proposal is about the coming week.
  const [offset, setOffset] = useState<0 | 1>(() => (isoWeekday(now) === 7 && profile.autoPlan ? 1 : 0));
  const days = weekOf(addDays(now, 7 * offset));
  const weekStart = toIsoDate(days[0]!);
  const weekEnd = toIsoDate(addDays(days[6]!, 1));
  const key = `${profile.id}:${weekStart}`;
  const { week } = isoWeek(days[0]!);

  const availability = useLiveQuery(() => getAvailability(db, profile.id), [profile.id]);
  const sessions = useLiveQuery(
    () =>
      db.plannedSessions.where('[profileId+start]').between([profile.id, weekStart], [profile.id, weekEnd]).toArray(),
    [profile.id, weekStart, weekEnd],
  );
  const places = useLiveQuery(() => db.places.toArray(), []);
  const logs = useLiveQuery(
    () =>
      db.loggedActivities.where('[profileId+start]').between([profile.id, weekStart], [profile.id, weekEnd]).toArray(),
    [profile.id, weekStart, weekEnd],
  );
  // Logs merged into sessions (check-in + workout = combo), derived for display only.
  const logged = mergedSessions(logs ?? [], sessions ?? []);
  const memberships = useLiveQuery(() => db.memberships.toArray(), []);
  const people = useLiveQuery(() => db.profiles.toArray(), []);
  const coach = useLiveQuery(
    async () =>
      (await db.programmes.where('profileId').equals(profile.id).toArray()).find((p) => p.connectorId === COACH_ID) ??
      null,
    [profile.id],
  );
  const [replanning, setReplanning] = useState<Replanning | null>(null);
  const [logging, setLogging] = useState(false);
  const [view, setView] = useState<'me' | 'household'>('me');
  const [message, setMessage] = useState('');
  // Which week the proposal is shown for. Automatic (interview setting) when the week has nothing planned yet;
  // set while rendering, React's pattern for state derived from props (no effect, no extra render pass).
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const planned = sessions?.filter((s) => s.status === 'accepted' || s.status === 'done') ?? [];
  if (profile.autoPlan && sessions !== undefined && planned.length === 0 && shownFor !== key) setShownFor(key);
  const shown = shownFor === key;

  // The planner is deterministic, so the proposal is a live query: accepting a session makes it an anchor and
  // the rest of the proposal follows from the same rules.
  const plan = useLiveQuery(
    async () => (shown ? planWeek(await loadPlanInput(weekStart, nowIso)) : null),
    [shown, weekStart, nowIso],
  );

  const dateText = useDateText();
  const held = healthHold(profile);
  const pausedUntil = profile.pausedUntil && profile.pausedUntil >= today ? profile.pausedUntil : undefined;
  const restDays = new Set(profile.restDays ?? []);
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const dayName = (iso: string) => dayFmt.format(new Date(`${iso.slice(0, 10)}T12:00`));
  const activityName = (id: string) => activityCatalogue.find((a) => a.id === id)?.name[lang] ?? id;
  const placeName = (id?: string) => places?.find((p) => p.id === id)?.name;
  // A check-in-limit note names its membership, e.g. "Wellpass Plus 1 (Sam): ".
  const noteMembership = (id?: string) => {
    const m = id ? memberships?.find((x) => x.id === id) : undefined;
    return m && people ? `${membershipLabel(m, people, t, lang)}: ` : '';
  };

  const savedIds = new Set(sessions?.map((s) => s.id));
  const proposals = (plan?.proposals ?? []).filter(
    (p) => p.session.profileId === profile.id && !savedIds.has(p.session.id) && !dismissed.has(p.session.id),
  );
  const notes = (plan?.notes ?? []).filter((n) => n.profileId === profile.id);
  const offers = (plan?.offers ?? []).filter((o) => o.profileId === profile.id);
  // What to set in the Coach: the week's saved Coach sessions plus the ones proposed right now.
  const checklist = coach
    ? coachChecklist(coach, [...(sessions ?? []), ...proposals.map((p) => p.session)])
    : undefined;

  const showPlan = () => {
    setShownFor(key);
    setDismissed(new Set());
    setMessage('');
  };
  const accept = async (list: PlannedSession[]) => {
    await acceptSessions(db, list);
    setMessage(t('plan.accepted', { count: list.length }));
  };
  const dismiss = (id: string) => setDismissed(new Set([...dismissed, id]));
  const openReplan = async (session: PlannedSession, reason: Replanning['reason']) => {
    const offers = replan(await loadPlanInput(weekStart, nowIso), { sessionId: session.id, notBefore: nowIso });
    setReplanning({ session, reason, offers });
  };
  const choose = async (offer: ReplanOffer) => {
    if (!replanning) return;
    await applyReplan(db, offer.kind === 'skip' ? { replaces: offer.replaces } : offer, replanning.reason);
    setReplanning(null);
    setMessage(t('plan.saved'));
  };

  return (
    <section aria-labelledby="week-title" className="stack">
      <div className="week-head">
        <h2 id="week-title">{t('week.title', { week })}</h2>
        <p className="muted">{t('week.range', { from: dateFmt.format(days[0]!), to: dateFmt.format(days[6]!) })}</p>
      </div>

      <div className="plan-bar">
        <div role="group" aria-label={t('plan.weekSwitch')} className="segmented">
          {([0, 1] as const).map((o) => (
            <button key={o} type="button" aria-pressed={offset === o} onClick={() => setOffset(o)}>
              {t(o === 0 ? 'plan.thisWeek' : 'plan.nextWeek')}
            </button>
          ))}
        </div>
        {/* While proposals are open, accepting them is the main action; otherwise planning is. */}
        <button type="button" className={proposals.length > 1 ? 'ghost' : undefined} onClick={showPlan}>
          {shown ? t('plan.remake') : t('plan.make')}
        </button>
        {proposals.length > 1 && (
          <button type="button" onClick={() => void accept(proposals.map((p) => p.session))}>
            {t('plan.acceptAll')}
          </button>
        )}
      </div>

      <div className="plan-bar">
        {(people?.filter((p) => p.householdId === profile.householdId).length ?? 0) > 1 && (
          <div role="group" aria-label={t('household.toggle')} className="segmented">
            {(['me', 'household'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                {t(v === 'me' ? 'household.me' : 'household.all')}
              </button>
            ))}
          </div>
        )}
        {!logging && (
          <button type="button" className="ghost" onClick={() => setLogging(true)}>
            {t('manualLog.open')}
          </button>
        )}
      </div>
      {logging && (
        <ManualLogForm
          profile={profile}
          onCancel={() => setLogging(false)}
          onDone={(text) => {
            setLogging(false);
            setMessage(text);
          }}
        />
      )}

      {isoWeekday(now) === 7 && <WeekReview profile={profile} now={now} paused={Boolean(held || pausedUntil)} />}

      {(held || pausedUntil) && (
        <p className="card pause-banner">
          {held ? t('health.banner.held') : t('health.banner.paused', { date: dateText(pausedUntil!) })}
        </p>
      )}

      <p role="status" className="ok">
        {message}
      </p>

      {plan && (notes.length > 0 || offers.length > 0 || proposals.length === 0) && (
        <div className="card notes">
          <h3>{t('plan.notesTitle')}</h3>
          <ul>
            {notes.map((n) => (
              <li key={n.kind + (n.membershipId ?? '') + n.text.en}>
                {noteMembership(n.membershipId)}
                {n.text[lang]}
              </li>
            ))}
            {offers.map((o) => (
              <li key={o.ruleId}>{o.text[lang]}</li>
            ))}
            {proposals.length === 0 && notes.length === 0 && <li>{t('plan.nothing')}</li>}
          </ul>
        </div>
      )}

      {coach && checklist && <CoachCard checklist={checklist} now={coach.weekdays ?? []} placeName={placeName} />}

      {view === 'household' ? (
        <HouseholdWeek profile={profile} days={days} today={today} />
      ) : (
        <ol className="week">
          {days.map((d) => {
            const iso = toIsoDate(d);
            const isToday = iso === today;
            const windows = availability?.windows.filter((w) => w.day === isoWeekday(d)) ?? [];
            const daySessions = (sessions ?? []).filter((s) => s.start.startsWith(iso) && !HIDDEN.has(s.status));
            const dayProposals = proposals.filter((p) => p.session.start.startsWith(iso));
            return (
              <li key={iso} className={isToday ? 'day today' : 'day'} aria-current={isToday ? 'date' : undefined}>
                <div className="day-head">
                  <span className="day-name">{dayFmt.format(d)}</span>
                  <span className="muted">{dateFmt.format(d)}</span>
                  {isToday && <span className="badge">{t('week.today')}</span>}
                </div>
                {windows.length > 0 && (
                  <ul className="free" aria-label={t('week.freeTime')}>
                    {windows.map((w) => (
                      <li key={w.from}>{t('week.free', { from: w.from, to: w.to })}</li>
                    ))}
                  </ul>
                )}
                {restDays.has(iso) && (
                  <p className="rest-day">
                    <strong>{t('rest.is')}</strong> <span className="muted">{t('rest.hint')}</span>
                  </p>
                )}
                {iso >= today && daySessions.length === 0 && (
                  <button
                    type="button"
                    className="ghost"
                    aria-label={t(restDays.has(iso) ? 'rest.removeLabel' : 'rest.planLabel', { day: dayFmt.format(d) })}
                    onClick={() => void toggleRestDay(db, profile.id, iso)}
                  >
                    {t(restDays.has(iso) ? 'rest.remove' : 'rest.plan')}
                  </button>
                )}
                {daySessions.length + dayProposals.length === 0 ? (
                  !restDays.has(iso) && <p className="muted empty">{t('week.empty')}</p>
                ) : (
                  <ul className="sessions" aria-label={t('plan.sessions')}>
                    {daySessions.map((s) => {
                      const label = { activity: activityName(s.activityTypeId), day: dayName(s.start) };
                      const due = s.start <= nowIso;
                      return (
                        <li key={s.id} className={`session ${s.status}`}>
                          <SessionText s={s} name={label.activity} place={placeName(s.placeId)} lang={lang} />
                          {s.status === 'done' && (
                            <p className="ok">
                              {t('plan.statusDone')}
                              {sessionOfPlanned(logged, s.id)?.combo && ` · ${t('plan.combo')}`}
                            </p>
                          )}
                          {s.status === 'missed' && <p className="muted">{t('plan.statusMissed')}</p>}
                          {s.status === 'accepted' && (
                            <div className="actions">
                              {due ? (
                                <>
                                  <button
                                    type="button"
                                    aria-label={t('plan.doneLabel', label)}
                                    onClick={() => void completeSession(db, s.id)}
                                  >
                                    {t('plan.done')}
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost"
                                    aria-label={t('plan.missedLabel', label)}
                                    onClick={() => void openReplan(s, 'missed')}
                                  >
                                    {t('plan.missed')}
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="ghost"
                                  aria-label={t('plan.moveLabel', label)}
                                  onClick={() => void openReplan(s, 'moved')}
                                >
                                  {t('plan.move')}
                                </button>
                              )}
                            </div>
                          )}
                          {replanning?.session.id === s.id && (
                            <ReplanPanel
                              offers={replanning.offers}
                              describe={(o) => {
                                if (o.kind === 'skip') return { title: o.text[lang] };
                                const when = {
                                  day: dayName(o.session.start),
                                  from: o.session.start.slice(11, 16),
                                  to: endOf(o.session),
                                };
                                return {
                                  title: t(o.kind === 'new-slot' ? 'plan.newSlot' : 'plan.fallbackTitle', when),
                                  // The fallback's why line says the same as its title.
                                  detail: o.kind === 'new-slot' ? o.session.why[lang] : undefined,
                                };
                              }}
                              onChoose={(o) => void choose(o)}
                              onCancel={() => setReplanning(null)}
                            />
                          )}
                        </li>
                      );
                    })}
                    {dayProposals.map(({ session: s }) => {
                      const label = { activity: activityName(s.activityTypeId), day: dayName(s.start) };
                      return (
                        <li key={s.id} className="session proposed">
                          <p className="step">{t('plan.proposed')}</p>
                          <SessionText s={s} name={label.activity} place={placeName(s.placeId)} lang={lang} />
                          <div className="actions">
                            <button
                              type="button"
                              aria-label={t('plan.acceptLabel', label)}
                              onClick={() => void accept([s])}
                            >
                              {t('plan.accept')}
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              aria-label={t('plan.dismissLabel', label)}
                              onClick={() => dismiss(s.id)}
                            >
                              {t('plan.dismiss')}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {offset === 0 && <GameCard profile={profile} today={today} />}

      <p className="hint">{t('week.hint')}</p>
    </section>
  );
}

function SessionText({ s, name, place, lang }: { s: PlannedSession; name: string; place?: string; lang: Lang }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="session-title">
        <strong>{name}</strong>{' '}
        <span className="muted">
          {t('plan.time', { from: s.start.slice(11, 16), to: endOf(s) })}
          {place ? ` · ${place}` : ''}
        </span>
      </p>
      <p className="why">{s.why[lang]}</p>
    </>
  );
}

/** What to set in the Freeletics Coach for this week. Weekbeat sends nothing to Freeletics. */
function CoachCard({
  checklist,
  now,
  placeName,
}: {
  checklist: NonNullable<ReturnType<typeof coachChecklist>>;
  now: readonly number[];
  placeName: (id?: string) => string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const long = weekdayNames(lang);
  const short = weekdayNames(lang, 'short');
  const list = (days: readonly number[]) => days.map((d) => short[d - 1]).join(', ');
  const kind = (activityTypeId: string) =>
    t(activityTypeId === COACH_ACTIVITY.weighted ? 'coach.kinds.weighted' : 'coach.kinds.bodyweight');
  return (
    <section className="card coach" aria-labelledby="coach-title">
      <h3 id="coach-title">{t('coach.checklist.title', { name: COACH_NAME })}</h3>
      <p>
        {checklist.change
          ? now.length > 0
            ? t('coach.checklist.daysChange', { days: list(checklist.days), before: list(now) })
            : t('coach.checklist.days', { days: list(checklist.days) })
          : t('coach.checklist.daysSame', { days: list(checklist.days) })}
      </p>
      <ul>
        {checklist.sessions.map((s) => (
          <li key={`${s.day}-${s.activityTypeId}-${s.placeId ?? ''}`}>
            {t('coach.checklist.session', {
              day: long[s.day - 1],
              place: placeName(s.placeId) ?? t('coach.checklist.noPlace'),
              kind: kind(s.activityTypeId),
              min: s.durationMin,
            })}
          </li>
        ))}
      </ul>
      <p className="muted small">{t('coach.checklist.note')}</p>
    </section>
  );
}

function ReplanPanel({
  offers,
  describe,
  onChoose,
  onCancel,
}: {
  offers: ReplanOffer[];
  describe: (o: ReplanOffer) => { title: string; detail?: string };
  onChoose: (o: ReplanOffer) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="subcard replan" role="group" aria-labelledby="replan-title">
      <h4 id="replan-title" ref={heading} tabIndex={-1}>
        {t('plan.replanTitle')}
      </h4>
      <ul className="offers">
        {offers.map((o, i) => {
          const { title, detail } = describe(o);
          return (
            <li key={o.kind === 'skip' ? 'skip' : o.session.id}>
              {/* The best offer first and highlighted; the others look secondary. */}
              <button type="button" className={i === 0 ? undefined : 'ghost'} onClick={() => onChoose(o)}>
                <span className="offer-title">{title}</span>
                {detail && <span className="offer-detail">{detail}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="ghost" onClick={onCancel}>
        {t('common.cancel')}
      </button>
    </div>
  );
}
