# Knowledge base

The fitness know-how Weekbeat plans with. It is **data, not code**: the planner reads only these files.
Licensed under [CC BY 4.0](LICENSE) (the code is Apache-2.0), so others can reuse the rules with attribution.

## Files

- `activities.json` — activity catalogue: MET value and verbatim Compendium entry, Health Connect / HealthKit / FIT
  mapping, sources, confidence, `lastReviewed`. Intensity is derived from MET with the WHO thresholds.
- `rules.json` — rules (`intensity`, `weekly-targets`, `impact`, `complement`, `deload`, `principle`), each with the
  verbatim `quote` it encodes. `complement` rules say which need an activity leaves open (e.g. bone loading after
  cycling) and which activities cover it; the planner may suggest, never require them.
- `SOURCES.md` — how each source was used and checked, plus open points.

## Rules for every entry

- a primary source URL (guideline, position stand, review, compendium, platform documentation), not a blog summary
- the verbatim quote or table row it encodes
- `confidence` (`low` | `medium` | `high`) and `lastReviewed` (`YYYY-MM-DD`, the date it was checked against the source)
- German and English text

`knowledge/rules.test.ts` enforces this in CI.

## Status (v1)

| Part                           | Status                              | Source                                         |
| ------------------------------ | ----------------------------------- | ---------------------------------------------- |
| intensity                      | done                                | WHO 2020                                       |
| weekly-targets                 | done (5–17, 18–64, 65+)             | WHO 2020                                       |
| activity catalogue             | 20 activities                       | Compendium 2024 + platform docs                |
| impact                         | cycling, swimming, jog              | systematic review (bone)                       |
| complement (hobby → needs)     | bone, MTB overuse                   | systematic reviews, narrative review           |
| load-recovery                  | deload, no-cap principle; gaps open | Delphi consensus, systematic review; ACSM open |
| safety (self-check, red flags) | open (#4)                           | PAR-Q+                                         |

## Changing rules

Changes come as pull requests with the source for each change; a maintainer reviews and merges.
A monthly research task proposes updates the same way. Nothing changes unreviewed.
