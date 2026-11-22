# Contributing to Weekbeat

Thanks for helping! Please follow our [Code of Conduct](CODE_OF_CONDUCT.md). Weekbeat is a local-first weekly planner for movement and wellness.
The UI is **German first, English second**; code, comments, issues and pull requests are in English.

## Setup

```sh
nvm use            # Node 22 (see .nvmrc)
npm ci
npm run dev        # http://localhost:5173
npm run format     # Prettier
npm run check      # lint + format check + typecheck + tests with coverage + build (what CI runs)
npx playwright install chromium && npm run e2e   # screenshots at phone and tablet width → screenshots/
```

## Where things go

| Folder             | What                                                       | May import                           |
| ------------------ | ---------------------------------------------------------- | ------------------------------------ |
| `core/`            | data model, planner, game; pure TypeScript, no UI          | nothing from `app/` or `connectors/` |
| `knowledge/`       | sourced training rules as JSON (CC BY 4.0)                 | `core/` types                        |
| `connectors/<id>/` | one folder per connector, implements `connectors/types.ts` | `core/`                              |
| `app/`             | React UI, i18n                                             | everything                           |

ESLint enforces the import rules.

## Pull requests

- One topic per pull request; CI (lint, typecheck, tests, build, screenshots) must be green.
- Every user-visible string goes into **both** `app/i18n/de.json` and `app/i18n/en.json` (a test checks the keys match).
- UI changes: attach the phone and tablet screenshots from `npm run e2e` (also uploaded by CI).
- Knowledge rules: each change needs a primary source URL, a confidence and a `lastReviewed` date. No rule without a source.
- Connectors: declare every host and what is sent in `permissions`; never commit keys, tokens or copied provider data.
- Use provider names only descriptively ("works with Wellpass"); no logos.

## Licences and sign-off (DCO)

Code contributions are licensed under Apache-2.0, contributions to `knowledge/` under CC BY 4.0.
Every commit must be signed off under the [Developer Certificate of Origin](https://developercertificate.org/):

```sh
git commit -s -m "Add yoga to the activity catalogue"
```

This adds `Signed-off-by: Your Name <you@example.com>` and confirms you have the right to submit the work under these licences.

## Not medical advice

Weekbeat is for fitness and wellness. Contributions must not add diagnosis or therapy features
(that would make it a medical device under EU rules).
