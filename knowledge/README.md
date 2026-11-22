# Knowledge base

The fitness know-how Weekbeat plans with. It is **data, not code**: the planner reads only these files.
Licensed under [CC BY 4.0](LICENSE) (the code is Apache-2.0), so others can reuse the rules with attribution.

## Files

- `activities.json` — activity catalogue: MET value and verbatim Compendium entry, Health Connect / HealthKit / FIT
  mapping, sources, confidence, `lastReviewed`. Intensity is derived from MET with the WHO thresholds.
- `rules.json` — rules (`intensity`, `weekly-targets`, `principle`), each with the verbatim `quote` it encodes.
- `SOURCES.md` — how each source was used and checked, plus open points.

## Rules for every entry

- a primary source URL (guideline, position stand, review, compendium, platform documentation), not a blog summary
- the verbatim quote or table row it encodes
- `confidence` (`low` | `medium` | `high`) and `lastReviewed` (`YYYY-MM-DD`, the date it was checked against the source)
- German and English text

`knowledge/rules.test.ts` enforces this in CI.

## Status (v1, part 1)

| Part                           | Status                  | Source                                      |
| ------------------------------ | ----------------------- | ------------------------------------------- |
| intensity                      | done                    | WHO 2020                                    |
| weekly-targets                 | done (5–17, 18–64, 65+) | WHO 2020                                    |
| activity catalogue             | 20 activities           | Compendium 2024 + platform docs             |
| complement (hobby → needs)     | open                    | sports-science reviews, federation guidance |
| load-recovery                  | open                    | position stands (e.g. ACSM), reviews        |
| safety (self-check, red flags) | open (#4)               | PAR-Q+                                      |

## Changing rules

Changes come as pull requests with the source for each change; a maintainer reviews and merges.
A monthly research task proposes updates the same way. Nothing changes unreviewed.
