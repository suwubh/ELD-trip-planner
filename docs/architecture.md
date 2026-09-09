# Architecture

## Overview

Linehaul Ledger is a stateless single-page trip-planning application. A React/Vite frontend collects four inputs—current location, pickup location, dropoff location, and current cycle-used hours—and sends them to a Django REST API. Django resolves locations and obtains an HGV route from openrouteservice (ORS), then passes normalized route data to a pure Hours-of-Service (HOS) scheduling module. The API returns display-ready route, compliance, itinerary, and daily-log data. React renders those results with React Leaflet/OpenStreetMap and printable SVG log sheets.

The planner starts at the browser time at which the plan is requested. That timestamp is client metadata, not a fifth form input. The requested route order is current location → pickup → dropoff.

## Boundaries and data flow

```text
React + TypeScript (Vercel)
  form / results / Leaflet map / SVG logs
          |
          | HTTPS JSON, VITE_API_BASE_URL
          v
Django REST API (Render)
  validation / error mapping / API orchestration
          |
          +--> ORS client: geocoding + HGV routing (ORS_API_KEY, server only)
          |
          +--> pure HOS engine: minute events, compliance, daily-log grouping
          v
normalized plan response
```

- **Frontend owns:** input interaction, browser start timestamp capture, accessibility, API request states, map presentation, itinerary/compliance display, SVG rendering, and browser print/save-PDF action.
- **Backend owns:** request validation, ORS calls, all route/provider normalization, HOS decisions, daily-log data generation, and safe error responses.
- **HOS engine owns:** deterministic scheduling only. It receives no Django request objects, makes no network calls, and receives a clock/start timestamp as an argument.
- **No persistence:** plans are calculated per request and are not stored.

## ORS provider boundary

`trips.ors_client.OrsClient` is the only module that calls ORS. It reads `ORS_API_KEY` from Django's environment at runtime, uses bounded request timeouts, and maps provider/network/decode failures to internal typed errors. API views translate those errors into generic, credential-safe responses.

- Location suggestions call ORS Pelias autocomplete and normalize `id`, label, address, and coordinates.
- Submitted locations are resolved with ORS Pelias geocoding before route planning.
- The client makes one `driving-hgv` GeoJSON route request per route leg (current → pickup, then pickup → dropoff). ORS's longitude/latitude coordinates are normalized to the application’s latitude/longitude contract and distance/duration values are converted to miles/minutes.
- Client tests patch the HTTP boundary (`urlopen`) and API-view tests patch the client. No test requires an ORS key or a network call.

## HOS engine design

The engine models an ordered list of minute-precise events. Each event has `start`, `end`, `durationMinutes`, `dutyStatus`, `kind`, `required`, `reason`, and optional location/route context. Duty statuses are `off_duty`, `sleeper_berth`, `driving`, and `on_duty_not_driving`.

Scheduling rules in scope:

1. Add one hour of on-duty/not-driving service at pickup and at dropoff.
2. Break driving into legal segments while enforcing a maximum of 11 driving hours after a qualifying 10-hour off-duty reset and no driving after the 14-hour duty window.
3. Insert a required 30-minute non-driving break before driving would exceed eight cumulative driving hours.
4. Insert 30-minute on-duty fuel stops at least every 1,000 route miles.
5. When a daily limit prevents further driving, insert 10 consecutive off-duty hours, reset daily counters, and continue.
6. Count driving, service, fuel, and on-duty breaks against the supplied 70-hour cycle. Do not project unknown rolling eight-day reductions. If the next on-duty work would exceed 70 hours, insert a 34-hour off-duty restart and reset the modeled cycle counter.
7. Split events at local calendar midnight when generating a daily log. Status totals on the resulting sheet must equal the event minutes shown on that sheet.

The engine returns machine-readable reasons as well as a plain-language explanation for every required stop. Tests use explicit start timestamps and normalized route fixtures for deterministic results.

## Deployment topology

| Component | Host | Configuration |
| --- | --- | --- |
| React/Vite SPA | Vercel | `VITE_API_BASE_URL` set to the deployed Django API origin |
| Django REST API | Render | `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, `ORS_API_KEY` |
| Geocoding and HGV routing | openrouteservice | Called only by Django with `ORS_API_KEY` |
| Base map tiles | OpenStreetMap via React Leaflet | Attribution visibly retained in the UI |

`DJANGO_CORS_ALLOWED_ORIGINS` must include the final Vercel HTTPS origin. Secrets are configured in host dashboards, never in Git or `VITE_` variables.

The repository includes `render.yaml` for the API service, `frontend/vercel.json` for Vite SPA deep-link support, and `.github/workflows/ci.yml` for backend, frontend, and Playwright verification. Deployment remains a dashboard action because the ORS key and final host URLs must be supplied as host-managed environment variables.

## API specification

All endpoints are JSON under `/api/v1`. Error payloads use a stable envelope and never expose ORS response bodies or credentials.

### `GET /api/v1/locations/suggest`

Returns normalized ORS-backed location suggestions for a form field.

**Query parameters**

| Name | Required | Rules |
| --- | --- | --- |
| `q` | yes | Non-empty location text, trimmed; implementation enforces a small minimum length and maximum length. |
| `limit` | no | Positive bounded integer; default is implementation-defined and small. |

**200 example**

```json
{
  "suggestions": [
    {
      "id": "ors:place:chicago",
      "label": "Chicago, Illinois, United States",
      "address": "Chicago, IL, United States",
      "position": { "lat": 41.8781, "lng": -87.6298 }
    }
  ]
}
```

### `POST /api/v1/trips/plan`

Creates one stateless route and HOS plan. `startTime` is captured by the browser at submission time. It is required for deterministic timeline output but is not displayed as a separate operator input.

**Request**

```json
{
  "currentLocation": { "query": "Chicago, IL" },
  "pickupLocation": { "query": "Indianapolis, IN" },
  "dropoffLocation": { "query": "Columbus, OH" },
  "currentCycleUsedHours": 42.5,
  "startTime": "2026-09-09T09:15:00-05:00"
}
```

Locations may later support a selected suggestion identifier/coordinates in addition to `query`, but Django remains responsible for final resolution. `currentCycleUsedHours` must be a number from 0 through 70 inclusive. `startTime` must be an ISO-8601 timestamp with an offset.

**200 example (abridged)**

```json
{
  "trip": {
    "startTime": "2026-09-09T09:15:00-05:00",
    "locations": {
      "current": { "label": "Chicago, IL", "position": { "lat": 41.8781, "lng": -87.6298 } },
      "pickup": { "label": "Indianapolis, IN", "position": { "lat": 39.7684, "lng": -86.1581 } },
      "dropoff": { "label": "Columbus, OH", "position": { "lat": 39.9612, "lng": -82.9988 } }
    }
  },
  "route": {
    "distanceMiles": 357.2,
    "durationMinutes": 401,
    "geometry": [[41.8781, -87.6298], [39.7684, -86.1581], [39.9612, -82.9988]],
    "legs": []
  },
  "compliance": {
    "isCompliant": true,
    "drivingHoursUsed": 6.7,
    "drivingHoursRemaining": 4.3,
    "dailyWindowHoursRemaining": 5.3,
    "cycleHoursUsed": 50.2,
    "cycleHoursRemaining": 19.8,
    "nextRequiredStop": null,
    "summary": "Trip can be completed within the modeled HOS limits."
  },
  "events": [
    {
      "id": "event-001",
      "kind": "driving",
      "dutyStatus": "driving",
      "start": "2026-09-09T09:15:00-05:00",
      "end": "2026-09-09T12:30:00-05:00",
      "durationMinutes": 195,
      "required": false,
      "reason": "Driving to pickup",
      "location": null
    }
  ],
  "itinerary": [],
  "dailyLogs": []
}
```

`itinerary` is a chronologically ordered, display-ready subset/summary of stops and major driving segments. `dailyLogs` includes one entry per local calendar date, events clipped to that date, status totals, remarks, and metadata required by the SVG component.

**Validation error example — 400**

```json
{
  "error": {
    "code": "validation_error",
    "message": "Some trip inputs are invalid.",
    "fields": {
      "currentLocation": ["A current location is required."],
      "currentCycleUsedHours": ["Enter a number from 0 through 70."]
    }
  }
}
```

**Provider/unavailable error example — 502 or 504**

```json
{
  "error": {
    "code": "routing_unavailable",
    "message": "Truck routing is temporarily unavailable. Please try again."
  }
}
```

Status-code mapping is finalized with implementation: 400 for client validation, 404/422 for unresolved locations where appropriate, 502 for invalid/upstream provider responses, and 504 for provider timeouts.
