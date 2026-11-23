# Game module (core/game)

Optional; reacts to logged sessions, never decides (concept doc → "Gamification", issue #7). Pure TypeScript,
derived from logs on every call, nothing stored or edited. Entry point: `gameState(input)`, `null` when the game is
off (`profile.game.enabled` false or household `gameMode` `'off'`).

| Part         | Rule                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessions     | `mergedSessions` (core/model/merge.ts): a check-in plus a workout counts once (combo)                                                             |
| Weekly goal  | The person's own goals per ISO week (sessions or minutes, optional categories)                                                                    |
| Maximum      | `game.weeklyMaxSessions` if set, else the sessions goal, else the minutes goal; beyond it: no credit                                              |
| Week streak  | Weeks in a row with every goal met; the running week and paused weeks are skipped                                                                 |
| Missed week  | Restarts the streak quietly; `bestStreak` is kept for good; no message about it                                                                   |
| Pause        | `profile.pauses` + the current `pausedUntil` + an open health hold: paused days count nothing and earn nothing                                    |
| Planned rest | `profile.restDays`: a passed rest day without training (and not paused) earns `restDayXp` once a week; never counts toward the goal or the streak |
| XP           | Minutes × factor of the WHO intensity band (knowledge/), + bonuses: combo, together, variety, complement                                          |
| Levels       | From total XP, start at 1, never go down                                                                                                          |

Numbers (`tuning.ts`) are **game tuning, not fitness rules**: chosen by the user on 23.11.2026, free to change,
no health claim. Intensity bands and complements come from `knowledge/` rules.

Profiles have no age, so the strength quest is offered only while every adult weekly-targets rule (18–64, 65+)
agrees on the number of strength days. Seasonal quests (`SEASONAL_QUESTS`) are game ideas, not fitness rules.
Pause mode, the health hold and planned rest are written by `core/model/health.ts` (issue #4). Every pause is also
kept in `profile.pauses`, so past pause weeks stay frozen after the pause ends; a health hold is recorded there when
the person confirms a doctor's OK.
Competitive mode comes later.
