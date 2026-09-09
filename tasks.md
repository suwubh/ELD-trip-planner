# Linehaul Ledger — implementation checklist

## Working agreement

- **Status:** planning checkpoint; no application code has been created yet.
- **Source priority:** the user's written request in this repository conversation is the implementation scope. The supplied assessment document, FMCSA guide, and reference images are supporting material; they do not authorize requirements that conflict with the request.
- **Checkpoint commits:** stop at each numbered checkpoint below so the repository can be committed before the next phase begins. Keep commits small and describe the completed checkpoint.
- **Scope guardrails:** build a lean, stateless trip planner. Do not add authentication, a database, dispatch features, or commit provider/API secrets.

## Definition of done

- [ ] A Django REST API plans truck routes through HERE and returns a deterministic, HOS-compliant minute-level timeline and daily log data.
- [ ] A React application accepts all four required planning inputs, displays the route, compliance rail, itinerary, and printable responsive SVG daily logs.
- [ ] Invalid inputs and provider failures are explicit, safe, and covered by tests.
- [ ] Backend, frontend, and end-to-end tests pass in CI; production builds succeed.
- [ ] README and project-context files document setup, assumptions, API contract, tests, and Vercel/Render deployment without secrets.
- [ ] The deployed Vercel frontend can call the deployed Render API, and the final handoff includes repository, deployment URL, and Loom demonstration.

## Checkpoint 1 — Repository foundation and project context

- [x] Create this `tasks.md` as the prioritized delivery checklist and keep its status current.
- [x] Create `state.md` with the current state, local commands, environment-variable names, deployment placeholders, active decisions, and exactly one next action.
- [x] Create `lessons.md` with only verified HOS/provider/test lessons; add entries as they are learned.
- [x] Create `docs/architecture.md` covering system boundaries, data flow, HOS engine design, deployment topology, and the evolving API contract.
- [x] Create a root `README.md` with the product purpose, local setup placeholders, scope, and repository conventions.
- [x] Add `.gitignore` entries for Python caches, Node artefacts, virtual environments, local environment files, coverage artefacts, and editor files.
- [x] Add `.env.example` files (or a clearly documented single example) listing names only: Django secret key, Django debug/hosts/CORS settings, HERE API key, and `VITE_API_BASE_URL`.
- [x] Decide and document the repository layout (`backend/` Django project and `frontend/` Vite React app) and supported runtime versions.
- [x] **Acceptance check:** a new contributor can see the intended architecture, planned environment names, and next action without reading chat history.
- [x] **Commit checkpoint:** `chore: initialize project documentation and structure`.

## Checkpoint 2 — Django API foundation

- [x] Create Django project configuration and a dedicated API/trips application under `backend/`.
- [x] Configure Django REST Framework, JSON-only API behaviour, CORS for the frontend origin, environment-based settings, and development defaults that never expose secrets.
- [x] Add health/readiness endpoint or equivalent lightweight operational check for Render.
- [x] Define typed/domain-friendly request and response schemas for locations, route legs, stops, events, compliance, and daily logs.
- [x] Implement shared API error responses with stable field-level validation messages and safe provider-error messages.
- [x] Add pytest, pytest-django, test settings, fixtures, and commands for isolated test runs.
- [x] Document local backend setup and all backend environment variables in README/state/architecture files.
- [x] **Acceptance check:** `GET /api/...` routing works locally, CORS is configured from environment, and a representative validation error is tested.
- [x] **Commit checkpoint:** `feat: scaffold django api foundation`.

## Checkpoint 3 — HERE geocoding and truck routing integration

- [x] Implement a backend-only HERE client; read `HERE_API_KEY` exclusively from server environment configuration.
- [x] Implement `GET /api/v1/locations/suggest` with a required query, sensible result limit, normalized suggestion payload, and explicit invalid-query response.
- [x] Geocode/resolve submitted pickup and delivery locations before planning; reject ambiguous/unresolvable locations with actionable errors.
- [x] Request HERE truck routing with truck-appropriate transport mode/settings and extract distance, duration, geometry/polyline, and route-leg information needed by the UI and scheduler.
- [x] Add timeouts and translate HERE timeout, HTTP failure, malformed-response, no-result, and routing-unavailable cases into safe API errors.
- [x] Keep provider response details out of client errors and source control; log only safe diagnostic context if logging is added.
- [x] Add mocked API tests for suggestion success, geocoding failure, routing failure, malformed provider data, and timeout.
- [x] Document the provider boundary, response normalization, and local test mocking approach.
- [x] **Acceptance check:** no HERE call is made from the browser and mocked tests prove all defined provider outcomes.
- [x] **Commit checkpoint:** `feat: add here location and truck routing api`.

## Checkpoint 4 — Pure HOS scheduling engine

- [ ] Create a framework-independent backend module with no HTTP/provider calls; it consumes normalized route distance/duration, start time, and supplied cycle-used hours.
- [ ] Model minute-accurate, ordered timeline events with start/end timestamps, duration, duty status, location/route context, reason, and whether the stop is required.
- [ ] Enforce the property-carrying limits required for this assessment: maximum 11 driving hours after 10 consecutive hours off duty; no driving after the 14th consecutive duty-window hour; 30-minute non-driving break after 8 cumulative driving hours; 70-hour/8-day on-duty cycle.
- [ ] Start at the current browser time provided by the planning request/contract and start with a fresh daily window; make the timezone assumption explicit and deterministic in tests.
- [ ] Add exactly one hour of on-duty/not-driving service time at both pickup and delivery.
- [ ] Insert 30-minute on-duty fuel stops at least every 1,000 route miles, including clear placement logic for long legs.
- [ ] Insert required 30-minute breaks before a driver would exceed eight cumulative driving hours; explain the trigger in event metadata.
- [ ] Insert 10 consecutive off-duty hours whenever the daily driving limit or 14-hour window prevents the next driving segment.
- [ ] Treat `currentCycleUsedHours` conservatively: do not assume future 8-day rolling reductions. When continued on-duty work would exceed 70 hours, insert a 34-hour restart before resuming and reset only the modeled cycle counter.
- [ ] Define and test event-boundary ordering so service, fuel, and break time correctly consumes the 14-hour window and cycle on-duty capacity, while off-duty time does not.
- [ ] Compute compliance summary values: driving used/remaining, daily-window remaining, cycle used/remaining, next required stop/reason, restart status, and compliance verdict.
- [ ] Make every required event explainable in plain language for the frontend (for example, “30-minute break required after 8 hours of cumulative driving”).
- [ ] Add focused pytest coverage: short trip, service time, fuel cadence, break trigger, 11-hour limit, 14-hour window, overnight reset, multi-day events/logs, 70-hour restart, and log/event-total consistency.
- [ ] Record only verified interpretations and edge cases in `lessons.md`; cite the FMCSA source link in documentation rather than reproducing guidance wholesale.
- [ ] **Acceptance check:** the engine is deterministic and fully testable from route fixtures without Django, HERE, or the clock.
- [ ] **Commit checkpoint:** `feat: implement hos scheduling engine`.

## Checkpoint 5 — Trip-plan endpoint and API contract

- [ ] Implement `POST /api/v1/trips/plan` accepting current location, pickup location, delivery location, and `currentCycleUsedHours` as the four planning inputs. The frontend supplies the current browser time as request metadata; it is not a separate user-entered input.
- [ ] Validate all three required locations and ensure `currentCycleUsedHours` is numeric and inclusive from `0` through `70`; return explicit field errors for invalid values.
- [ ] Orchestrate location resolution, HERE truck routing, HOS scheduling, itinerary derivation, and daily-log grouping.
- [ ] Return normalized route geometry, route statistics, stop itinerary, compliance summary, chronological timeline events, and one or more daily logs.
- [ ] Ensure daily-log boundaries are calendar-day based in the documented trip timezone, splitting events across midnight where required.
- [ ] Define a versioned response schema and concrete request/response/error examples in `docs/architecture.md` and README.
- [ ] Add endpoint tests with mocked HERE responses for a successful multi-day plan, validation failures, geocoding failure, routing failure, and timeout.
- [ ] **Acceptance check:** a client can render the entire product from the plan response with no provider-specific parsing.
- [ ] **Commit checkpoint:** `feat: deliver trip planning endpoint`.

## Checkpoint 6 — React application shell and trip form

- [ ] Create a Vite React + TypeScript application under `frontend/` with linting, formatting conventions, Vitest, and production build scripts.
- [ ] Establish the operator-console visual system: deep navy application surfaces, warm paper log sheets, safety-orange compliance accents, restrained borders, and legible tabular/data typography.
- [ ] Implement responsive application layout for form, map/results, compliance rail, itinerary, and log sheets.
- [ ] Build the four-input trip form with current-location, pickup-location, and delivery-location suggestions plus the cycle-used-hours input; capture the current browser time when planning starts.
- [ ] Debounce location suggestions; expose loading, empty, keyboard-accessible selection, and request-error states.
- [ ] Validate input before submission and render backend field errors clearly without losing form state.
- [ ] Use `VITE_API_BASE_URL` only for API configuration; do not expose or reference HERE credentials in the frontend.
- [ ] Add form unit tests for initial, loading, invalid, error, and successful-submission states.
- [ ] **Acceptance check:** an operator can create a valid plan request entirely from the browser and understands any blocking validation issue.
- [ ] **Commit checkpoint:** `feat: build planner form and console shell`.

## Checkpoint 7 — Route map, compliance rail, and itinerary

- [ ] Add React Leaflet with OpenStreetMap tiles and visible, correct OpenStreetMap attribution.
- [ ] Render route geometry, fit the map to the route, and provide a clear non-map fallback/error state.
- [ ] Use distinct, accessible marker/icon treatments for pickup, delivery, fuel, 30-minute breaks, overnight 10-hour rests, and 34-hour restarts.
- [ ] Render a compliance rail that presents status, remaining driving/window/cycle capacity, and the next required stop.
- [ ] Render timeline events chronologically with local times, duration, duty status, location/leg context, and plain-language reason for every required stop.
- [ ] Clearly distinguish planned required stops from pickup/delivery service and normal driving segments.
- [ ] Add component tests for compliance explanations, itinerary chronology, marker mapping, map empty/failure state, and accessible labels.
- [ ] **Acceptance check:** a long trip visually communicates where the driver goes, why stops happen, and remaining legal capacity without reading raw JSON.
- [ ] **Commit checkpoint:** `feat: visualize route compliance and itinerary`.

## Checkpoint 8 — Responsive SVG daily ELD logs and printing

- [ ] Design a reusable SVG daily-log component inspired by the supplied blank-paper-log reference while using the project visual system and generated trip data.
- [ ] Render a 24-hour duty-status grid with the four statuses (off duty, sleeper berth, driving, on duty/not driving) and accurate line segments from the event timeline.
- [ ] Render per-status totals, date, trip metadata, route/remarks, and required-stop annotations in the log sheet.
- [ ] Split multi-day plans into additional daily sheets automatically; correctly represent events that span midnight.
- [ ] Make log sheets readable at common responsive widths and add print CSS for clean one-sheet-per-page output.
- [ ] Provide a print/save-PDF control that invokes browser printing without server-side PDF generation.
- [ ] Add Vitest coverage for grid status segments, totals, metadata/remarks, multi-day sheet generation, and print control.
- [ ] **Acceptance check:** a multi-day plan produces printable, internally consistent daily SVG logs with no clipped grid or missing totals.
- [ ] **Commit checkpoint:** `feat: add printable svg eld logs`.

## Checkpoint 9 — End-to-end quality, CI, and deployment

- [ ] Add Playwright configuration and a mocked multi-day trip-plan scenario that verifies route display, required stops, multiple daily log sheets, and print output/control.
- [ ] Run backend tests, frontend lint, TypeScript type-check, Vitest, production build, and Playwright locally; fix failures and capture the final commands in README.
- [ ] Add GitHub Actions workflow to run backend tests plus frontend lint, type-check, tests, and production build on every push (and PR if appropriate).
- [ ] Configure Render deployment for Django with production secret key, HERE key, allowed hosts, and Vercel CORS origin set through Render environment variables.
- [ ] Configure Vercel deployment for the React app with `VITE_API_BASE_URL` pointing to the Render API; confirm production build/output settings.
- [ ] Verify deployed CORS, API validation, successful route planning, map attribution, multi-day logs, and print flow using safe non-secret configuration.
- [ ] Update `state.md` with actual deployment URLs/settings names (never secret values), and update README with final setup/deployment instructions.
- [ ] **Acceptance check:** CI is green on a pushed commit and the live Vercel app completes a representative long-trip plan against Render.
- [ ] **Commit checkpoint:** `ci: add verification and deployment configuration`.

## Checkpoint 10 — Submission handoff

- [ ] Perform a final requirements pass against this checklist and the user request; mark only verified work complete.
- [ ] Confirm no secrets, `.env` files, provider responses containing credentials, or generated local artefacts are tracked by Git.
- [ ] Confirm README contains the GitHub repository URL, live Vercel URL, local setup, API summary, HOS assumptions, test commands, deployment configuration names, and known scope limits.
- [ ] Record final factual state and any remaining known limitations in `state.md` and `lessons.md`.
- [ ] Record a 3–5 minute Loom: input a long trip, inspect required HOS stops/compliance rail, open multi-day SVG logs/print flow, show relevant scheduler tests, show CI/deployment, and provide the repository/live links.
- [ ] Submit the GitHub repository, Vercel URL, and Loom URL.
- [ ] **Acceptance check:** another evaluator can run or inspect the project and validate every scoped requirement without credentials beyond their own HERE key.
- [ ] **Commit checkpoint:** `docs: finalize assessment handoff`.

## Ongoing maintenance rules

- [ ] At the start and end of each checkpoint, update the status/checkmarks in this file.
- [ ] Update `state.md`, `lessons.md`, and `docs/architecture.md` immediately after every material decision, implementation milestone, deployment configuration change, or verified lesson.
- [ ] Keep implementation decisions test-backed; if an HOS interpretation is uncertain, document the assumption before coding it.
- [ ] Before each checkpoint commit, review `git status`, run the checkpoint’s relevant tests, and ensure no secrets are staged.
