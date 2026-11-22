import type { IsoDate, IsoDateTime, PlanInput } from '../core/index.ts';
import { activityCatalogue, knowledgeRules } from '../knowledge/index.ts';
import { db } from './db.ts';

/** Everything the planner reads, straight from this device's database (nothing leaves the device). */
export async function loadPlanInput(weekStart: IsoDate, notBefore: IsoDateTime): Promise<PlanInput> {
  const [profiles, availability, places, memberships, programmes, anchors, logs] = await Promise.all([
    db.profiles.toArray(),
    db.availability.toArray(),
    db.places.toArray(),
    db.memberships.toArray(),
    db.programmes.toArray(),
    db.plannedSessions.toArray(),
    db.loggedActivities.toArray(),
  ]);
  return {
    weekStart,
    notBefore,
    profiles,
    availability,
    places,
    memberships,
    programmes,
    anchors,
    logs,
    catalogue: activityCatalogue,
    rules: knowledgeRules,
  };
}
