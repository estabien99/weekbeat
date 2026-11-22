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
