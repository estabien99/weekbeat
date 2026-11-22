// Shared test fixtures for the planner: one person (A) with Freeletics Coach, MTB on Saturday, home and gym.
import { activityCatalogue, knowledgeRules } from '../../knowledge/index.ts';
import type { Place, PlannedSession, Profile, TimeWindow } from '../model/types.ts';
import type { PlanInput } from './types.ts';

export const MON = '2026-11-23'; // date -d 2026-11-23 +%A → Monday
export const act = (id: string) => activityCatalogue.find((a) => a.id === id)!;

export const weekday = (day: TimeWindow['day'], from: string, to: string): TimeWindow => ({ day, from, to });
export const WINDOWS: TimeWindow[] = [
  ...([1, 2, 3, 4, 5] as const).map((d) => weekday(d, '18:00', '20:00')),
  weekday(6, '09:00', '13:00'),
];

export const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'p-a',
  householdId: 'h',
  name: 'A',
  lang: 'de',
  level: 'intermediate',
  goals: [{ kind: 'sessions', target: 3 }],
  hobbies: ['mtb'],
  limitations: [],
  game: { enabled: true },
  preferredSessionMin: 45,
  ...over,
});

export const home: Place = {
  id: 'home',
  name: 'Home',
  kind: 'home',
  membershipIds: [],
  categories: [],
  equipment: ['mat'],
};
export const gym: Place = {
  id: 'gym',
  name: 'Gym',
  kind: 'partner',
  membershipIds: ['m-wp'],
  categories: ['strength', 'mobility'],
  equipment: ['barbell'],
  travelMin: 15,
  openingHours: ([1, 2, 3, 4, 5] as const).map((day) => ({ day, from: '06:00', to: '22:00' })),
};

export const saturdayMtb: PlannedSession = {
  id: 's-mtb',
  profileId: 'p-a',
  activityTypeId: 'mtb',
  start: '2026-11-28T09:00',
  durationMin: 120,
  why: { de: '', en: '' },
  status: 'accepted',
};

export function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    weekStart: MON,
    profiles: [profile()],
    availability: [{ id: 'av-a', profileId: 'p-a', windows: WINDOWS, busy: [] }],
    places: [home, gym],
    memberships: [{ id: 'm-wp', provider: 'wellpass', ownerProfileId: 'p-a' }],
    programmes: [
      {
        id: 'prog-fl',
        profileId: 'p-a',
        name: 'Freeletics Coach',
        connectorId: 'freeletics-coach',
        daysPerWeek: 2,
        typicalSessions: [{ activityTypeId: 'bodyweight-vigorous', durationMin: 30, equipment: [] }],
      },
    ],
    anchors: [saturdayMtb],
    logs: [],
    catalogue: activityCatalogue,
    rules: knowledgeRules,
    ...over,
  };
}
