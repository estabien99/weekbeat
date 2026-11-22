# Weekly planner (core/planner)

Deterministic rule engine with scoring (concept doc → "Weekly planner"): same inputs, same plan. Pure TypeScript:
no clock, no storage, no randomness. Entry point: `planWeek(input)`.

| Step              | File             | What it does                                                                                          |
| ----------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| Collect inputs    | `week.ts`        | One person's week in week minutes: windows, busy blocks, anchors, logs, memberships                   |
|                   | `candidates.ts`  | Options (programme days, hobbies, sourced complements) × places × free stretches                      |
| Hard constraints  | `constraints.ts` | Pause, setting, equipment, window, overlap (travel included), opening hours, programme days, recovery |
| Score candidates  | `score.ts`       | Goal fit, programme, complement, variety, membership, spread, distance (0…1 each)                     |
| Pick and explain  | `plan.ts`        | Greedy pick up to the goal and the weekly maximum, fixed tie-break order                              |
|                   | `why.ts`         | One line per session, de + en, from the two strongest terms                                           |
| Offers and notes  | `plan.ts`        | Deload offers (never applied) and neutral notes when the week falls short                             |
| Replan, household | —                | Next PR (#5)                                                                                          |

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
