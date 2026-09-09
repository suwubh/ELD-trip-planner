# Verified lessons

Keep this file factual. Add an entry only after it is verified by an authoritative source, a reproducible test, or an observed provider behaviour.

## HOS rules in scope

- The assessment scope is a property-carrying driver under the 70-hour/8-day rule, with no adverse-driving exception.
- The requested scheduler must apply the 11-hour driving limit, 14-hour driving window, 30-minute break after eight cumulative driving hours, and 70-hour/8-day on-duty cycle.
- Pickup and dropoff each consume one hour of on-duty/not-driving time; a fuel stop is required at least every 1,000 route miles.
- The supplied current cycle-used total is treated conservatively: do not invent future rolling-cycle reductions. A modeled 34-hour restart is required before work would exceed the available cycle.

## Product and provider practices

- HERE credentials must remain backend-only. Browser code receives normalized route data, never a HERE key or raw provider credential.
- Daily logs need calendar-day splitting and minute-level totals; cross-midnight events must be split before rendering a sheet.
- The supplied blank log is visual reference material, not a form to copy verbatim. Generated SVG sheets must instead render the required duty grid, totals, remarks, and trip metadata responsively.

## Workspace observations

- On 2026-09-09, Node.js `v22.18.0` was available. The `python` command failed to launch and `py` was unavailable, so backend setup cannot yet be verified locally.
- On 2026-09-09, this folder was not a local Git repository despite the GitHub remote having been created; initialize or clone it before the first checkpoint commit.
