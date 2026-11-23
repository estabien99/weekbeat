# Weekly planner (core/planner)

Deterministic rule engine with scoring (concept doc → "Weekly planner"): same inputs, same plan. Pure TypeScript:
no clock, no storage, no randomness. Entry point: `planWeek(input)`.

| Step             | File             | What it does                                                                                          |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| Collect inputs   | `week.ts`        | One person's week in week minutes: windows, busy blocks, anchors, logs, memberships                   |
|                  | `candidates.ts`  | Options (programme days, hobbies, sourced complements) × places × free stretches                      |
| Hard constraints | `constraints.ts` | Pause, setting, equipment, window, overlap (travel included), opening hours, programme days, recovery |
| Score candidates | `score.ts`       | Goal fit, programme, together, complement, variety, membership, spread, distance (0…1 each)           |
| Pick and explain | `plan.ts`        | Greedy pick up to the goal and the weekly maximum, fixed tie-break order                              |
|                  | `why.ts`         | One line per session, de + en, from the two strongest terms                                           |
| Offers and notes | `plan.ts`        | Deload offers (never applied) and neutral notes when the week falls short                             |
| Household        | `candidates.ts`  | Also tries the start of a household member's same session; `together` term                            |
| Replan           | `replan.ts`      | Offers only: new slots (same place, one per day), 20-min home fallback, let go                        |

Rules:

- **Rules only from `knowledge/`.** Complements, deload and recovery gaps come from rule data. The recovery check is
  inactive until a sourced `recovery` rule exists (issue #3).
- **Never more than the goal.** The planner plans up to the person's own goals and, if set, their
  `game.weeklyMaxSessions`; there is no other weekly maximum.
- **Session length** comes from the programme, else `profile.preferredSessionMin`, else minutes goal ÷ sessions
  goal. Without one, hobbies and complements are not planned and a note asks for a length.
- **Weights** (`DEFAULT_WEIGHTS`) are engine tuning, not fitness rules: they only rank options that passed every hard
  constraint.
- **Determinism:** every input list is sorted by id first; equal scores fall back to start, origin, place, activity.
- **Programmes** (e.g. the Freeletics Coach): sessions take turns in `typicalSessions` order, one per day; a session
  with `placeIds` only goes to those places (and gets no home fallback); the programme's current `weekdays` score
  full, other days half, so the plan keeps them unless another day fits clearly better.
- **Replan never changes the plan.** `replan(input, { sessionId, notBefore })` returns offers; the app applies the
  one the person taps. The fallback length (20 min) is the concept doc's "20-minute home session".
- **Household:** each person keeps their own goals; people are planned in id order, and a later person can join an
  earlier person's anchor or proposal (same activity, place and start). Both sessions list each other in
  `withProfileIds`; the earlier person's why line stays as planned.
