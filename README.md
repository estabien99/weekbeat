# Weekbeat

**Deine Woche für Bewegung und Wohlbefinden.** Weekbeat ist ein Open-Source-Wochenplaner, der aus dem, was du
schon machst und hast – Hobbys, Trainings-Apps, Mitgliedschaften, Kalender – eine realistische Woche macht und dich
mit gesunder Gamification dranbleiben lässt. Lokal auf deinem Gerät, ohne Konto.

_Your week for movement and wellness._ Weekbeat is an open-source weekly planner that turns what you already do and
own (hobbies, training apps, memberships, calendar) into a realistic week and keeps you going with healthy
gamification. Local-first, no account.

> Status: v0.0 – project skeleton. The planner, knowledge base and game module come in v0.1.
> Fitness and wellness only, not medical advice.

## Principles

- The weekly planner is the core; everything else (connectors, memberships, gamification) is optional.
- Provider-agnostic: Wellpass first; Urban Sports Club, Wellhub, a single gym or none work the same way.
- Training rules are sourced data with a review date, not invented on the fly.
- Local-first and private: data stays on the device; export/import as JSON.
- Healthy motivation: rewards consistency, variety and recovery; no guilt, no loss mechanics.

## Development

```sh
npm ci
npm run dev      # http://localhost:5173
npm run check    # lint, typecheck, tests, build
npm run e2e      # Playwright screenshots at phone (412) and tablet (1280) width
```

Stack: Vite, React, TypeScript, PWA (vite-plugin-pwa), Dexie (IndexedDB), i18next (de/en), Vitest, Playwright.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the folder layout and rules.

## Licence

Code: [Apache-2.0](LICENSE). Knowledge base (`knowledge/`): [CC BY 4.0](knowledge/LICENSE).
Weekbeat is not affiliated with any provider it works with.
