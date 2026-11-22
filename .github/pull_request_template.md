## What and why

<!-- One or two sentences. Link the issue: Closes #… -->

## How it was checked

- [ ] `npm run check` is green (lint, format, typecheck, tests, build)
- [ ] UI change: `npm run e2e` screenshots looked at (phone + tablet, de + en); no new accessibility violations
- [ ] New user-visible text is in `de.json` **and** `en.json`

## Principles

- [ ] No new rule or number in code without a sourced entry in `knowledge/`
- [ ] No data leaves the device unless a connector the user enabled sends it; hosts declared in `permissions`
- [ ] Gamification: no loss mechanics, no guilt, no credit beyond the weekly maximum
- [ ] Commits are signed off (`git commit -s`)
