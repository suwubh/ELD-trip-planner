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

- On 2026-09-09, Python `3.12.6` was available at `C:\Users\subha\AppData\Local\Programs\Python\Python312\python.exe`, while the `python` app alias remained unusable in this shell. Use the project virtual environment executable directly in documented commands.
- On 2026-09-09, the local Git remote was configured as `https://github.com/suwubh/ELD-trip-planner.git`; checkpoint commits remain local until explicitly pushed.
- Django `5.2.17` and the pytest suite run successfully in `.venv`. The API uses a custom REST Framework exception handler so field validation is returned in the documented `error` envelope.
