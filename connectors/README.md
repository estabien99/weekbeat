# Connectors

One folder per connector (`connectors/<id>/`), each exporting a `Connector` (`connectors/types.ts`).
Every connector is optional; the app works with manual entries alone.

Planned (concept doc → "Connectors"): `wellpass` and `freeletics-coach` (0.1, manual / steered),
`intervals-icu` (Garmin), `ical`, `open-meteo` (0.2), `home-assistant`, `google-calendar` (0.3),
`health-connect`, `apple-health` (0.4), later `urban-sports-club`, `wellhub`, `strava`.

Rules:

- Declare every host and what is sent in `permissions`; the user sees it before enabling.
- Secrets (API keys, tokens) stay on the user's device; never in the repo, logs or exports.
- Map sport types through `ActivityType.mapping` (Health Connect / HealthKit / FIT), no own vocabulary.
- Provider names only descriptively ("works with Wellpass"), no logos without permission.
- No copied studio or partner data in the repo: each user keeps their own catalogue.

## Memberships (`membership/`)

Wellpass, Urban Sports Club, Wellhub, a single gym or club, or any other membership share one manual module:
`membership/providers.ts` lists the providers (names only, neutral icons, no logos), and the core keeps memberships
and the household's own places (`core/model/memberships.ts`). No provider offers a member API, so there is no
`sync`; check-ins are logged by hand (source `checkin:<provider>`, `sourceRef` = membership id, `placeId`).
Marking a planned session at a place as done logs the visit too.

- Check-in limits: per day and per month on the membership, per month on a venue, as the person enters them.
  Where the monthly limit is left empty, the app applies a limit the provider states (`providers.ts` → `limits`,
  e.g. the Wellpass Plus 1 limit from 1 Jan 2027). The planner never plans past a limit and says so in a neutral
  note.
- Value meter: the month's visits through the person's memberships at their single-visit prices, next to the
  own share. Information only, no target or loss wording.

- Coverage is explicit: a place lists every membership that covers it. A linked add-on (Wellpass Plus 1) starts
  ticked with its main membership and can be unticked per place.
- Prices, plans and check-in limits differ by plan and city and are entered by the person. A provider fact goes
  into `providers.ts` only with a primary source (the provider's own pages), a verbatim quote and a review date;
  the form shows it as a hint with its source. Checked 22.11.2026: Wellpass (help centre, incl. the Plus 1 limit of
  10 check-ins per month from 1 Jan 2027), Urban Sports Club (prices page), Wellhub (partner academy only: the
  member help centre blocks automated reads).

## Freeletics Coach (`freeletics-coach/`)

No API: Weekbeat steers the Coach (Coach plan in the interview, Coach days planned like other programme sessions,
a checklist of days and places to set in the Coach) and never reads it. Import paths (Health Connect in 0.4,
Garmin in 0.2) and the open checks are in `freeletics-coach/README.md`.
