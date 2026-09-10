# Architecture

## Product boundary

Linehaul Ledger is a stateless Django + React trip-planning application. React collects current location, pickup location, dropoff location, and current 70-hour cycle usage. Django resolves locations, requests a commercial truck route from TomTom, and passes normalized route data into a deterministic Hours-of-Service (HOS) scheduler. The response drives an OpenStreetMap route view, itinerary, modeled HOS summary, and printable SVG duty-status sheets.

The implementation is an **assessment trip planner**. It is not an ELD, certified RODS generator, route dispatch system, or legal compliance service. It does not persist plans or collect a driver's complete duty history.

## Boundaries and data flow

```text
React + TypeScript (Vercel)
  four-input form / map / itinerary / printable SVG projections
          |
          | HTTPS JSON, VITE_API_BASE_URL
          v
Django REST API (Render)
  validation / error mapping / orchestration
          |
          +--> TomTom: search + commercial truck routing (server-side key)
          |
          +--> Pure HOS engine: timeline / modeled capacity / log grouping
          v
normalized plan response
```

- **Frontend:** input interaction, browser start-time capture, API states, route/map presentation, itinerary, SVG rendering, and print action.
- **Backend:** request validation, TomTom calls, provider normalization, modeled HOS decisions, daily-sheet data, and safe API errors.
- **HOS engine:** deterministic scheduling only; no Django request objects, HTTP calls, or implicit clock access.
- **No persistence:** each plan is calculated per request and not stored.

## Current HOS model and limitations

The HOS engine schedules ordered, minute-precise events: `off_duty`, `sleeper_berth`, `driving`, and `on_duty_not_driving`. It models the assessment's route assumptions:

1. One hour of on-duty service at pickup and at dropoff.
2. An 11-hour driving limit and 14-hour driving window from a modeled fresh daily window.
3. A 30-minute non-driving interruption before driving would exceed eight cumulative hours.
4. A 30-minute on-duty fuel stop at least every 1,000 route miles.
5. A 10-hour off-duty reset when the modeled driving/day window prevents further driving.
6. A conservative 34-hour restart before modeled on-duty work would exceed the supplied 70-hour cycle total.
7. Calendar-midnight splitting of scheduled events for individual duty-status sheets.

This is not a complete legal HOS determination. The four assessment inputs do not establish when the driver last had a 10-hour reset, daily driving already used, current 14-hour window, last qualifying break, or the individual days needed to calculate an eight-day rolling recap. Consequently, `isCompliant` describes the modeled schedule only. Future work must either collect sufficient duty history or make the fresh-shift assumption explicit in every result.

FMCSA's current property-carrying guidance is the reference for the 11-hour, 14-hour, 30-minute-break, and 60/70-hour rules: [Summary of HOS Regulations](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations).

## Time standard and daily sheets

The API contract requires an offset-bearing ISO-8601 `startTime`; all event grouping and display use one explicit home-terminal time standard.

- React uses `getLocalOffsetIsoString()` to capture and send the local/trip offset rather than raw UTC.
- The Django serializer strictly validates that timestamps include an explicit timezone offset, rejecting naive datetimes with HTTP 400.
- Daily sheets are formatted according to the FMCSA 49 CFR § 395.8 grid standard and pad all 24.0 hours (1,440 minutes) from midnight to midnight.
- The 70-hour / 8-day rolling recap calculates cycle usage and correctly resets upon completion of a 34-hour restart, displaying 0.0 available hours while a restart is in-progress across midnight and resuming available cycle hours for post-restart work.
- Because the assessment inputs are strictly limited to the four trip parameters, carrier, vehicle, and home terminal fields are labeled as simulated dispatch preview defaults.

## TomTom provider boundary

`trips.tomtom_client.TomTomClient` is the only module that calls TomTom. It reads `TOMTOM_API_KEY` at runtime, uses a bounded timeout, normalizes provider output, and maps provider/network/decode failures to typed internal errors. API views return safe generic messages and do not expose provider response bodies or credentials.

- Suggestions return provider ID, label, address, and position.
- Selected suggestions pass their resolved coordinates (`position: { lat, lng }`) directly into the trip plan request, bypassing redundant geocoding.
- The client requests each leg with `travelMode=truck` and `vehicleCommercial=true`, normalizing metres/seconds to miles/minutes.
- Fuel/rest points have no provider facility lookup. Their marker position is estimated along the route unless an event already has a location.

## API specification

All endpoints are JSON under `/api/v1`. Error payloads have a stable envelope and do not contain provider credentials or response bodies.

### `GET /api/v1/locations/suggest`

Returns normalized TomTom search suggestions.

| Parameter | Required | Current rules |
| --- | --- | --- |
| `q` | yes | Trimmed, at least two characters |
| `limit` | no | Integer from 1 through 10; defaults to 5 |

### `POST /api/v1/trips/plan`

Creates one modeled route and HOS plan.

```json
{
  "currentLocation": { "query": "Chicago, IL" },
  "pickupLocation": { "query": "Indianapolis, IN" },
  "dropoffLocation": { "query": "Columbus, OH" },
  "currentCycleUsedHours": 42.5,
  "startTime": "2026-09-09T09:15:00-05:00"
}
```

`currentCycleUsedHours` must be 0 through 70. `startTime` must be an offset-bearing ISO-8601 timestamp (e.g. `2026-09-09T09:15:00-05:00`); naive timestamps are strictly rejected with HTTP 400.

The response includes normalized trip locations, route geometry and summaries, a modeled compliance object, chronological events/itinerary, and `dailyLogs`. Each `dailyLogs` entry represents a complete 24.0-hour duty-status projection formatted under FMCSA 49 CFR § 395.8.

Error mapping: 400 for validation/scheduling input errors, 422 for unresolved locations, 502 for provider failures, 503 for location-suggestion unavailability, and 504 for provider timeouts.

## Deployment topology

| Component | Host | Configuration |
| --- | --- | --- |
| React/Vite SPA | Vercel | `VITE_API_BASE_URL` set to deployed Django API origin |
| Django API | Render | `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, `TOMTOM_API_KEY` |
| Routing/search | TomTom | Called only by Django with server-side credential |
| Base map tiles | OpenStreetMap | Attribution visible in the UI |

`render.yaml`, `frontend/vercel.json`, and GitHub Actions configuration are present. Deployment has not been verified. Before public release, configure the final CORS/host values, verify a live TomTom route, and address the Django production security checklist (TLS/proxy handling, secure cookies, HSTS policy, and no development fallback secret).
