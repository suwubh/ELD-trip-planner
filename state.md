# Project state

## Current status

- **Phase:** Checkpoint 2 complete — Django API foundation.
- **Completed:** Project-context files, root hygiene files, Django/DRF project under `backend/`, environment-based settings, CORS, JSON-only REST configuration, health endpoint, validation envelope, typed API domain contracts, and pytest foundation tests.
- **Application code:** API foundation only. HERE integration and HOS planning are not implemented.
- **Repository state:** this workspace is not currently initialized as a local Git repository. The intended remote is `https://github.com/suwubh/ELD-trip-planner.git`.

## Active decisions

- Repository layout will be `backend/` for Django and `frontend/` for Vite React + TypeScript.
- The required form inputs are current location, pickup location, dropoff location, and current cycle-used hours. The trip starts at the browser time when the user requests a plan.
- The route sequence is current location → pickup → dropoff. The Django backend alone communicates with HERE.
- The application is stateless: no authentication, database, or dispatch-management functionality.
- Target runtimes are Python 3.12+ and Node.js 22 LTS. This workspace uses Python `3.12.6`, Django `5.2.17`, Django REST Framework `3.16.1`, and Node `v22.18.0`.

## Environment-variable names

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | Django/Render | Django cryptographic secret |
| `DJANGO_DEBUG` | Django | Development-only debug switch |
| `DJANGO_ALLOWED_HOSTS` | Django/Render | Comma-separated permitted hostnames |
| `DJANGO_CORS_ALLOWED_ORIGINS` | Django/Render | Comma-separated frontend origins allowed to call the API |
| `HERE_API_KEY` | Django/Render | Server-side HERE geocoding and truck-routing credential |
| `VITE_API_BASE_URL` | Vite/Vercel | Public base URL for the Django API |

## Deployment placeholders

- **Frontend:** Vercel, configured with `VITE_API_BASE_URL`.
- **Backend:** Render, configured with Django variables and `HERE_API_KEY`.
- **Production CORS:** set `DJANGO_CORS_ALLOWED_ORIGINS` to the deployed Vercel origin after it exists.
- **URLs:** not deployed yet.

## Next action

Implement the backend-only HERE client and location-suggestion endpoint (Checkpoint 3).
