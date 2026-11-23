import { matchesSuggestion } from '../knowledge.ts';
import type { MergedSession } from '../model/merge.ts';
import type {
  ActivityCategory,
  ActivityType,
  Badge,
  ComplementData,
  Id,
  IsoDate,
  KnowledgeRule,
  Profile,
  XPEvent,
} from '../model/types.ts';
import type { GameWeek } from './state.ts';
import { GAME_TUNING, SEASONAL_QUESTS } from './tuning.ts';

/** A quest's state this month. Derived, never stored; the app words it from `key`. */
export interface QuestProgress {
  /** "strength", "complement", or a seasonal key such as "autumn-mix". */
  key: string;
  /** For complement quests: what the rule's need is, e.g. "bone-loading". */
  need?: ComplementData['need'];
  /** For the strength quest: days with strength a week needs (from the rule). */
  perWeek?: number;
  ruleId?: Id;
  from: IsoDate;
  to: IsoDate;
  target: number;
  progress: number;
  done: boolean;
}

interface Ctx {
  profile: Profile;
  weeks: readonly GameWeek[];
  events: readonly XPEvent[];
  activities: ReadonlyMap<Id, ActivityType>;
  rules: KnowledgeRule[];
  today: IsoDate;
}

const day = (iso: string): IsoDate => iso.slice(0, 10);

/**
 * Badges: firsts and milestones, earned at the session that unlocked them, never taken away. Only counted
 * sessions unlock them, so nothing beyond the weekly maximum or on paused days does.
 */
export function badgesOf({ profile, weeks, events, activities }: Ctx): Badge[] {
  const badges: Badge[] = [];
  const earn = (key: string, s: MergedSession) => {
    if (!badges.some((b) => b.key === key))
      badges.push({ id: `${profile.id}:${key}`, profileId: profile.id, key, earnedAt: s.primary.start });
  };
  const counted = weeks.flatMap((w) => w.counted);
  const bySessionId = new Map(counted.map((s) => [s.primary.id, s]));

  counted.forEach((s, i) => {
    if (i === 0) earn('first-session', s);
    const category = activities.get(s.primary.activityTypeId)?.category;
    if (category) earn(`first-category:${category}`, s);
    for (const n of GAME_TUNING.badgeSessions) if (i + 1 === n) earn(`sessions:${n}`, s);
  });
  for (const reason of ['combo', 'together'] as const) {
    const first = events.find((e) => e.reason === reason);
    const s = first?.loggedActivityId ? bySessionId.get(first.loggedActivityId) : undefined;
    if (s) earn(`first-${reason}`, s);
  }

  let streak = 0;
  for (const w of weeks) {
    const seen = new Set<ActivityCategory>();
    for (const s of w.counted) {
      const c = activities.get(s.primary.activityTypeId)?.category;
      if (c) seen.add(c);
      if (seen.size === GAME_TUNING.badgeVarietyWeek) earn('variety-week', s);
    }
    if (w.status === 'met') {
      streak++;
      const last = w.counted.at(-1);
      for (const n of GAME_TUNING.badgeStreaks) if (streak === n && last) earn(`streak:${n}`, last);
    } else if (w.status === 'missed') streak = 0;
  }
  // Stable sort: badges of the same session keep the order they were earned in.
  return badges.sort((a, b) => a.earnedAt.localeCompare(b.earnedAt));
}

/** This month's quests: from sourced rules (strength, complement) and the seasonal game ideas. */
export function questsOf({ profile, weeks, activities, rules, today }: Ctx): QuestProgress[] {
  const month = today.slice(0, 7);
  const monthNo = Number(today.slice(5, 7));
  const from = `${month}-01`;
  const lastDay = new Date(Number(today.slice(0, 4)), monthNo, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  const inMonth = weeks.flatMap((w) => w.counted).filter((s) => day(s.primary.start).startsWith(month));
  const activityOf = (s: MergedSession) => activities.get(s.primary.activityTypeId);
  const quest = (q: Omit<QuestProgress, 'from' | 'to' | 'done'>): QuestProgress => ({
    ...q,
    from,
    to,
    done: q.progress >= q.target,
  });
  const quests: QuestProgress[] = [];

  // Strength: the WHO adult rules (18–64 and 65+) both ask for strength on at least n days a week. Profiles
  // have no age, so the quest is offered only while every adult rule agrees on n.
  const adult = rules.flatMap((r) =>
    r.part === 'weekly-targets' && r.data.ageFrom >= 18 && r.data.strengthDaysMin !== undefined
      ? [{ id: r.id, days: r.data.strengthDaysMin }]
      : [],
  );
  if (adult.length > 0 && adult.every((r) => r.days === adult[0]!.days)) {
    const days = adult[0]!.days;
    const progress = weeks.filter((w) => {
      if (!w.weekStart.startsWith(month)) return false;
      const strengthDays = new Set(
        w.counted.filter((s) => activityOf(s)?.category === 'strength').map((s) => day(s.primary.start)),
      );
      return strengthDays.size >= days;
    }).length;
    quests.push(
      quest({ key: 'strength', ruleId: adult[0]!.id, perWeek: days, target: GAME_TUNING.questStrengthWeeks, progress }),
    );
  }

  // Complement: one quest per complement rule that applies to the person's hobbies.
  for (const r of rules) {
    if (r.part !== 'complement' || !r.data.forActivityIds.some((id) => profile.hobbies.includes(id))) continue;
    const { forActivityIds, suggest, need } = r.data;
    const progress = inMonth.filter((s) => {
      const a = activityOf(s);
      return a !== undefined && !forActivityIds.includes(a.id) && matchesSuggestion(a, suggest);
    }).length;
    quests.push(
      quest({ key: 'complement', need, ruleId: r.id, target: GAME_TUNING.questComplementSessions, progress }),
    );
  }

  // Seasonal: game ideas, one per season.
  const seasonal = SEASONAL_QUESTS.find((q) => (q.months as readonly number[]).includes(monthNo));
  if (seasonal) {
    const acts = inMonth.map(activityOf).filter((a): a is ActivityType => a !== undefined);
    const progress =
      seasonal.kind === 'indoor'
        ? acts.filter((a) => a.setting !== 'outdoor').length
        : seasonal.kind === 'outdoor'
          ? acts.filter((a) => a.setting !== 'indoor').length
          : seasonal.kind === 'swimming'
            ? acts.filter((a) => a.category === 'swimming').length
            : new Set(acts.map((a) => a.category)).size;
    quests.push(quest({ key: seasonal.key, target: seasonal.target, progress }));
  }
  return quests;
}
