# Knowledge base

The fitness know-how Weekbeat plans with. It is **data, not code**: the planner reads only these files.
Licensed under [CC BY 4.0](LICENSE) (the code is Apache-2.0), so others can reuse the rules with attribution.

## Rules for every rule

Each entry in `rules.json` is a `KnowledgeRule` (`core/model/types.ts`) and must have:

- `source.url` — the primary source (guideline, position stand, review, compendium), not a blog summary
- `confidence` — `low` | `medium` | `high`
- `lastReviewed` — `YYYY-MM-DD`, the date someone last checked it against the source
- `summary` — German and English

`knowledge/rules.test.ts` enforces this in CI.

## Parts and planned sources (to verify before use)

| Part               | Content                                                                            | Planned source                                  |
| ------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| activity-catalogue | MET, muscle groups, impact, recovery need                                          | Compendium of Physical Activities (2024 update) |
| weekly-targets     | moderate/vigorous minutes, strength days by age group                              | WHO guidelines on physical activity (2020)      |
| complement         | hobby → needs → activity categories (MTB → core, hip mobility, upper body)         | sports-science reviews, federation guidance     |
| load-recovery      | gaps after intense sessions, weekly increase limits, deloads, return after a break | position stands (e.g. ACSM), reviews            |
| safety             | health self-check before start, red flags that pause the plan                      | PAR-Q+ style questionnaire                      |

## Changing rules

Changes come as pull requests with the source for each change; a maintainer reviews and merges.
A monthly research task proposes updates the same way. Nothing changes unreviewed.
