# Linehaul Ledger — ELD Trip Planner

Linehaul Ledger is a focused Django + React trip planner for property-carrying drivers. It plans a TomTom truck route from a current location through pickup and dropoff, schedules required Hours-of-Service (HOS) events, and presents a route map, compliance explanation, itinerary, and printable daily ELD log sheets.

> Status: project foundation only. Application code has not been started.

## Scope

The planner accepts four operator inputs:

1. Current location
2. Pickup location
3. Dropoff location
4. Current cycle-used hours (0–70)

It begins the plan at the browser’s current time. The backend uses TomTom for location suggestions, geocoding, and commercial truck routing. The HOS engine applies the assessment’s property-carrying rules: 11-hour driving limit, 14-hour driving window, 30-minute break after eight cumulative driving hours, 70-hour/8-day cycle, one-hour pickup/dropoff service, fuel at least every 1,000 route miles, 10-hour daily reset, and a conservative 34-hour restart for cycle exhaustion.

This intentionally does **not** include authentication, a database, dispatch management, or any attempt to implement HOS exceptions outside the stated scope.

## Planned architecture

- `backend/` — Django + Django REST Framework API, TomTom client, pure HOS scheduler, and pytest tests.
- `frontend/` — Vite React + TypeScript UI, React Leaflet/OpenStreetMap map, responsive SVG logs, Vitest, and Playwright tests.
- `docs/architecture.md` — data flow, HOS design, deployment topology, and the complete API contract.
- `tasks.md`, `state.md`, `lessons.md` — current plan, factual project state, and verified implementation lessons.

## Prerequisites

- Python 3.12 or later
- Node.js 22 LTS or later
- A TomTom API key with Search and Routing API access

Node `v22.18.0` is available in the current workspace. Python needs to be installed or repaired locally before backend work can begin.

## Environment configuration

Copy `.env.example` to a local `.env` file and fill the placeholder values. Do not commit it.

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Django secret key |
| `DJANGO_DEBUG` | Local debug switch |
| `DJANGO_ALLOWED_HOSTS` | Django allowed hostnames |
| `DJANGO_CORS_ALLOWED_ORIGINS` | Frontend origins allowed by Django |
| `TOMTOM_API_KEY` | Backend-only TomTom credential |
| `VITE_API_BASE_URL` | Public frontend API base URL |

## Local development

The backend foundation is ready. From the repository root in PowerShell:

```powershell
& 'C:\Path\To\Python312\python.exe' -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Set-Location backend
& ..\.venv\Scripts\python.exe manage.py runserver
```

Run backend checks and tests from `backend/`:

```powershell
& ..\.venv\Scripts\python.exe manage.py check
& ..\.venv\Scripts\python.exe -m pytest
```

The health endpoint is available at `http://localhost:8000/api/v1/health/`. The intended frontend development URL is `http://localhost:5173`.

The available location-suggestion endpoint is `GET /api/v1/locations/suggest?q=Chicago`. It is backed by TomTom from Django only; a local `TOMTOM_API_KEY` is required for a live request.

If this folder has not yet been linked to GitHub, initialize it or clone the existing remote before the first commit:

```powershell
git init
git remote add origin https://github.com/suwubh/ELD-trip-planner.git
```

## Testing and quality gates

Run the backend checks from `backend/`:

```powershell
& ..\.venv\Scripts\python.exe -m pytest
& ..\.venv\Scripts\python.exe manage.py check
```

Run the frontend checks from `frontend/`:

```powershell
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run test:e2e
```

- Pytest/Django tests for validation, HOS scheduling, log consistency, and mocked TomTom failures.
- Vitest tests for form states, compliance explanations, itinerary, and SVG logs.
- Playwright coverage for a mocked multi-day plan, map/results, multiple logs, and print control.
- [GitHub Actions](.github/workflows/ci.yml) runs backend tests plus frontend lint, unit tests, production build, and Playwright Chromium coverage on every push and pull request.

## Deployment

- [`render.yaml`](render.yaml) defines a Render free-plan Django web service. Create it from the repository Blueprint, then set `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, and `TOMTOM_API_KEY` in Render; Render generates `DJANGO_SECRET_KEY` and the blueprint sets `DJANGO_DEBUG=false`.
- Deploy `frontend/` to Vercel with `frontend` as the project root. The included [`frontend/vercel.json`](frontend/vercel.json) preserves SPA deep links. Set `VITE_API_BASE_URL` to the deployed Render API origin (without a trailing slash).
- After the Vercel URL exists, set Render's `DJANGO_CORS_ALLOWED_ORIGINS` to that exact HTTPS origin and set `DJANGO_ALLOWED_HOSTS` to the Render API hostname.
- Never expose `TOMTOM_API_KEY` to Vite, Vercel client code, GitHub, screenshots, or Loom.

The final submission will contain the [GitHub repository](https://github.com/suwubh/ELD-trip-planner), deployed Vercel URL, and 3–5 minute Loom.

## Reference

- [FMCSA Hours of Service summary](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations)
- See `docs/architecture.md` for the API request/response contract and HOS scheduling model.
