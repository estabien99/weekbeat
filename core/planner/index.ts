// Public surface of the planner (re-exported by core/index.ts).
export { planWeek, trainingWeeks } from './plan.ts';
export { sessionLength } from './candidates.ts';
export { placeFits } from './constraints.ts';
export * from './types.ts';
export { replan, FALLBACK_MIN, type ReplanOffer, type ReplanRequest } from './replan.ts';
