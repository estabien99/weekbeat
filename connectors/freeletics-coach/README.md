# Freeletics Coach (`freeletics-coach/`)

Freeletics has no public API. Weekbeat does not scrape the app and does not use private or unofficial APIs
(CLAUDE.md → Providers). Instead it **steers** the Coach: the person enters their Coach plan, the planner places
the Coach days in the week, and the week view says what to set in the Coach. Nothing is sent to Freeletics.

## What 0.1 does (`coach.ts`)

- **Coach plan per person** (interview step "Freeletics Coach", redoable in Settings): days per week, session
  length, bodyweight / with weights / both (taking turns), where the weights are (the person's own places), and
  the days the Coach is set to now (optional). Stored as a `Programme` with `connectorId: 'freeletics-coach'`.
- **Activities:** bodyweight sessions count as `bodyweight-vigorous`, sessions with weights as `weight-training`
  (`COACH_ACTIVITY`). Imports later map to the same catalogue types through `ActivityType.mapping`.
- **Planner:** Coach sessions are programme options; sessions with weights go only to the chosen places
  (`ProgrammeSession.placeIds`), and the days the Coach is set to now are preferred (`programme` scoring term).
- **Checklist** (`coachChecklist`): the week's training days, whether they differ from the Coach's current days,
  and the place (Workout Space) per session. The person changes the Coach by hand.
- **Done:** "Erledigt" logs the session (`manual`, or a check-in at a place), so the game can count it later.

## Import paths (planned)

| Path                     | Version | How                                                                                                     | Open                                                                                                       |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Health Connect (Android) | 0.4     | Read the exercise sessions the Freeletics app writes, merge them with the planned Coach session by time | Check on the device whether Freeletics writes workouts there, and with which exercise type and data origin |
| Apple Health (iPhone)    | 0.4     | Same with HealthKit workouts                                                                            | Not needed in the household now (Android)                                                                  |
| Garmin via intervals.icu | 0.2     | Activities recorded on the watch during a Coach workout                                                 | Only if the person records them                                                                            |
| Data export file         | –       | –                                                                                                       | No download is offered in the app (checked by the user, 23.11.2026)                                        |
| Screenshot reading       | later   | On-device text recognition of the Coach week                                                            | Needs a new dependency: ask first                                                                          |

Logs from several sources (check-in + Freeletics + Garmin) are merged into one session before they count (PR B,
combo sessions).

## Provider facts

None are stored yet. help.freeletics.com refuses automated reads (HTTP 403, checked 22.11.2026), so no fact about
the Coach (number of training days, Workout Spaces, equipment of weighted journeys, health sync) is verified. A
fact goes in only with a primary source, a verbatim quote and a review date (as in `membership/providers.ts`).
The app therefore names no Coach limits and lets the person enter 1–7 days.
