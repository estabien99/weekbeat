# Weekbeat — working rules

Weekbeat is an open-source, local-first weekly planner for movement and wellness. The source of truth for
product decisions is the concept doc "Weekbeat – Konzept": https://claude.ai/artifact/TdmF75uNsR8ShvE4d5BfSF
(a Claude Docs doc: read it with the Claude Docs connector, not a web fetch). When this file and the doc disagree,
ask the user which one is current and fix the other.

Chat with the user in English. Everything in the app (UI text, notifications, store listing) is **German first,
English second**. Code, comments, commits, issues and PRs are in English.

## Start of every session
1. `git pull --rebase` on the working branch; read this file and only the doc sections the task needs.
2. `npm ci` if `node_modules` is missing; `npm run check` must be green before you change anything.
3. This repo is separate from the Home Assistant maintenance setup ("Unser Nest"). Don't change HA from here;
   the HA connector (v0.3) talks to HA only through its documented REST API with the user's own token.

## Principles (from the concept doc, decided 22.11.2026)
- **The weekly planner is the core.** Everything else feeds it or reacts to it. Only the planner decides.
- **Everything else is optional**, gamification and memberships included. With no connector the app works on
  manual entries.
- **Provider-agnostic.** Wellpass is the first membership module; Urban Sports Club, Wellhub, a single gym or none
  work the same way. Freeletics is the first coach-plan connector.
- **Sourced know-how.** Training rules are data in `knowledge/` with source URL, confidence and review date.
  Never invent a rule or a number in code; if a rule is missing, add it to `knowledge/` with a source or ask.
- **Local-first and private.** Data stays on the device (Dexie/IndexedDB); export and import as JSON.
  No server holds health data in v0.x.
- **Healthy motivation.** Reward consistency, variety and recovery. No daily streaks, no loss mechanics,
  no guilt messages, no credit beyond the weekly maximum, nothing that rewards training through red flags.
  Pause mode freezes goals and streaks.
- **For everyone.** German and English, beginners to advanced, accessible (WCAG 2.2 AA), multi-person households.
- **Open source** (Apache-2.0 code, CC BY 4.0 knowledge base) so people can trust it with health data.

## Architecture
- One TypeScript core on the device, the same on web, Android and iPhone. Connectors are plugins that feed it,
  the UI is a thin layer on top.
- Folders and import rules (ESLint enforces them):
  - `core/` — data model (`core/model`), planner (`core/planner`), game (`core/game`). Pure TS, no React, no
    i18n, no imports from `app/` or `connectors/`. Public surface: `core/index.ts`.
  - `knowledge/` — `rules.json` (+ later more files), each entry a `KnowledgeRule`; `rules.test.ts` enforces
    sources and review dates. Licensed CC BY 4.0.
  - `connectors/<id>/` — one folder per connector, implementing `connectors/types.ts`; may import `core/`.
  - `app/` — React UI, i18n (`app/i18n/de.json`, `en.json`, keys must match).
- Stack: Vite 8, React 19, TypeScript 6.0 (typescript-eslint does not support 7.x yet; stay on `~6.0` until it
  does), vite-plugin-pwa (installable, update only after the user taps "Neu laden"), Dexie 4, i18next, Vitest,
  Playwright, ESLint.
- No backend in v0.x. If a connector needs a CORS proxy or a secret, a tiny optional Cloudflare Worker that
  stores nothing. Sync later: Supabase in an EU region, opt-in.
- Phones (0.4): Capacitor wraps the same app and adds Health Connect / Apple Health plugins.
- Planner: deterministic rule engine with scoring (same inputs → same plan), every rule testable. Steps:
  collect inputs → hard constraints → score candidates → pick and explain (one-line "why" per session) → replan
  (offer a fallback, never change silently).
- Data model: the eleven entity groups in `core/model/types.ts`. Activity types map to Health Connect, HealthKit
  and FIT sport types; connectors never get their own vocabulary. Logs from several sources (check-in +
  Freeletics + Garmin) are merged into one session before they count. Game state is derived, never edited.
- Storage schema changes: add a new `db.version(n)`, never edit an old one; keep export/import working.

## Roadmap
0.1 Foundation (core + planner, knowledge base v1, gamification, Wellpass manual, Freeletics plan, two profiles,
export/import) → 0.2 Data (Garmin via intervals.icu, iCal, Open-Meteo) → 0.3 Everyday (Home Assistant,
reminders, Google Calendar two-way, family planner) → 0.4 Phones (Capacitor, Health Connect, Apple Health,
app stores) → later (EU sync, AI coach, Urban Sports Club, friends). We use each version ourselves before the
next starts. No dates yet.

## Rules
- **Ask before:** anything outside the request; adding a dependency or service; anything that costs money or
  creates accounts; changing the licence, name or a principle; publishing, releasing or promoting the app;
  network/environment changes; deleting anything that isn't ours from this session.
- **Secrets:** API keys and tokens never go into chat, the repo, logs or exports. During development they go
  through the session's secure credential form; in the app each user's keys stay on their device.
- **Sources:** for fitness rules, provider capabilities and legal points prefer primary sources (guidelines,
  position stands, the provider's own docs/help pages). Cite the URL, say how sure you are, flag disagreements.
- **Providers:** names only descriptively ("works with Wellpass"), no logos, no copied studio/partner data in the
  repo. Freeletics has no API: steer the Coach (days, place, settings checklist), don't scrape it.
- **Not a medical device:** fitness and wellness only; no diagnosis, no therapy plans. Health self-check before
  start, red flags pause the plan. Health-data consent before the first sync (GDPR Art. 9).
- **UI:** every string in both `de.json` and `en.json`; core HTML/CSS, accessible (labels, focus, 44 px targets,
  contrast); works from 320 px wide, no horizontal scroll. After UI changes run `npm run e2e` and look at
  `screenshots/` (phone 412 and tablet 1280, de and en) before telling the user it's done.
- **Facts about the household** (people, memberships, hobbies, devices, places) come from the user. Don't infer
  them; the concept doc lists what's known (Wellpass work account + Plus 1, Freeletics Coach, Garmin, MTB,
  Google Calendar, Home Assistant).
- Dates and weekdays: compute with `date -d` or code, never from memory.

## Workflow
- `npm run check` = lint + typecheck + unit tests + build (what CI runs on every PR, plus the e2e job).
- Tests: unit tests next to the code (`*.test.ts`, Vitest); UI screenshots in `e2e/` (Playwright, fixed clock).
  In cloud sessions the pre-installed Chromium matches `@playwright/test` 1.63.0 (pinned exactly; bump both
  together, or set `PW_CHROMIUM=/opt/pw-browsers/chromium`).
- Commits: small, English, imperative; sign off with `-s` (DCO, see CONTRIBUTING.md). Branch per task;
  PRs only when the user asks.
- Model choice: architecture and hard decisions on Opus; everyday implementation on Sonnet. If a task looks
  like it needs a stronger model than the session runs on, say so instead of guessing.
- Long sessions get expensive: when a topic is done, suggest a fresh session; this file + the doc make that cheap.

## Lessons learned (add one line whenever something went wrong or the user corrected you)
- (none yet)
