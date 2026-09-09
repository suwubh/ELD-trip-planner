# Project state

## Current status

- **Phase:** Checkpoint 1 complete; preparing Checkpoint 2 — Django API foundation.
- **Completed:** `tasks.md`, `.gitignore`, `.env.example`, this state file, `lessons.md`, `docs/architecture.md`, and `README.md` have been created.
- **Application code:** not started.
- **Repository state:** this workspace is not currently initialized as a local Git repository. The intended remote is `https://github.com/suwubh/ELD-trip-planner.git`.

## Active decisions

- Repository layout will be `backend/` for Django and `frontend/` for Vite React + TypeScript.
- The required form inputs are current location, pickup location, dropoff location, and current cycle-used hours. The trip starts at the browser time when the user requests a plan.
- The route sequence is current location → pickup → dropoff. The Django backend alone communicates with HERE.
- The application is stateless: no authentication, database, or dispatch-management functionality.
- Target runtimes are Python 3.12+ and Node.js 22 LTS. Node `v22.18.0` is available in this workspace; Python is not currently runnable from this shell and must be installed or repaired before backend work.

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

Create the Django API foundation under `backend/` after Python is available locally.
