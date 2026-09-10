# Linehaul Ledger — ELD Trip Planner & HOS Log Generator

Linehaul Ledger is a production-ready, full-stack **commercial truck trip planner and Electronic Logging Device (ELD) daily log generator** built with **Django REST Framework** and **React with TypeScript**.

It accepts commercial route parameters, calculates truck-compliant paths via TomTom, schedules deterministic Hours of Service (HOS) timelines under FMCSA property-carrying regulations (49 CFR § 395), and renders authentic, printable 24-hour Driver's Daily Log sheets.

---

## Key Capabilities

1. **4 Required Assessment Inputs:**
   - **Current location**
   - **Pickup location** (automatically adds 1 hour on-duty loading service)
   - **Dropoff location** (automatically adds 1 hour on-duty unloading service)
   - **Current Cycle Used** (0 to 70 hours for 70hr/8day property-carrying rule)
2. **1-Click Quick Demo Presets:**
   - **Regional Run (1 Day):** Chicago, IL → Indianapolis, IN → Columbus, OH (359 mi)
   - **Multi-Day (10h Reset):** Atlanta, GA → Nashville, TN → Dallas, TX (820 mi)
   - **Cross-Country (Fuel & Restart):** Los Angeles, CA → Denver, CO → New York, NY (2,780 mi)
3. **Pure, Deterministic HOS Engine:**
   - **11-Hour Driving Limit:** Enforces 10 consecutive hours off duty before further driving.
   - **14-Hour Duty Window:** Restricts driving after the 14th consecutive hour from duty start.
   - **30-Minute Rest Break:** Mandated after 8 cumulative driving hours without non-driving interruptions.
   - **Fueling Stops:** Mandated 30-minute on-duty fuel stop at least every 1,000 route miles.
   - **70-Hour / 8-Day Cycle:** Mandates a 34-hour restart before on-duty work exceeds 70 hours.
   - **Next Required Stop:** Real-time computation of upcoming mandatory stop with countdown and reason.
4. **Authentic FMCSA 24-Hour Driver's Daily Log Sheets (49 CFR § 395.8):**
   - Exact 24.0-hour accounting (1,440 minutes per day) with zero missing time gaps.
   - **Continuous step-line graph** with vertical connector lines transitioning across all 4 duty statuses (Off Duty, Sleeper Berth, Driving, On Duty Not Driving).
   - **15-minute grid tick marks** along each hour.
   - Total hours column on the right edge summing to exactly 24.00 hours.
   - Official Carrier header, Daily Driving Miles, Truck/Trailer #, and Driver Signature block.
   - Chronological **Remarks** table with timestamps and duty change locations.
   - Official **70-Hour / 8-Day Driver Recap table** (On duty today, last 7 days, available tomorrow).
   - Multi-day pagination tabs and clean **1-sheet-per-page print CSS**.
5. **Interactive Route Map:**
   - OpenStreetMap tiles with truck route polyline.
   - Custom pins and interactive popups for Pickup, Delivery, Fuel Stops, 30-min Breaks, 10-hr Resets, and 34-hr Restarts.

---

## System Architecture

```text
React 19 + TypeScript SPA (Vercel)
  Four-input form / Demo presets / Interactive Map / HOS Cockpit / SVG Daily Logs
          |
          | JSON API (CORS enabled)
          v
Django 5.2 REST API (Render)
  Validation / Strict Timezone Handling / Provider Boundary / Production Security
          |
          +--> TomTom Commercial Truck Routing & Search API (Server-side key)
          |
          +--> Pure HOS Engine: Minute-level timeline / 24h day logs / Recap table
```

---

## Local Development & Setup

### Prerequisites

- Python 3.12 or later
- Node.js 22 LTS or later
- TomTom API key (Search and Routing access)

### 1. Environment Setup

Copy `.env.example` to `.env`:

```env
DJANGO_SECRET_KEY=local-secret-key-for-development
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173
TOMTOM_API_KEY=your-tomtom-api-key-here
VITE_API_BASE_URL=http://localhost:8000
```

### 2. Backend (Django)

```powershell
# From repository root:
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Set-Location backend
& ..\.venv\Scripts\python.exe manage.py runserver
```

The Django API is accessible at `http://localhost:8000/api/v1/health/`.

### 3. Frontend (Vite + React)

```powershell
Set-Location frontend
npm.cmd install
npm.cmd run dev
```

The React console opens at `http://localhost:5173`.

---

## Automated Verification & Quality Gates

Run full test suites and quality gates:

```powershell
# 1. Backend pytest (28 tests passed)
& ..\.venv\Scripts\pytest backend\

# 2. Django check
& ..\.venv\Scripts\python backend\manage.py check

# 3. Frontend unit/component tests (9 tests passed)
Set-Location frontend
npm.cmd test -- --run

# 4. Frontend linter (0 errors, 0 warnings)
npm.cmd run lint

# 5. Production build
npm.cmd run build

# 6. Playwright E2E test (Mocked multi-day trip plan scenario)
npm.cmd run test:e2e
```

---

## Deployment to Render & Vercel

### Backend on Render (`render.yaml`)
1. Create a new Web Service on Render linked to this repository.
2. Root directory: `backend`
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT`
5. Configure environment variables in Render dashboard:
   - `DJANGO_SECRET_KEY`: Long random string
   - `DJANGO_DEBUG`: `false`
   - `DJANGO_ALLOWED_HOSTS`: Your Render domain (e.g. `your-app.onrender.com`)
   - `DJANGO_CORS_ALLOWED_ORIGINS`: Your Vercel frontend URL (e.g. `https://your-app.vercel.app`)
   - `TOMTOM_API_KEY`: Your TomTom API key

### Frontend on Vercel
1. Import repository on Vercel.
2. Framework Preset: `Vite`
3. Root Directory: `frontend`
4. Environment variable:
   - `VITE_API_BASE_URL`: Your deployed Render URL (e.g. `https://your-app.onrender.com`)

---

## Assessment Verification & Presentation

- **Evaluation Deliverables**: Live hosted web application, public GitHub repository, and recorded walkthrough video.
- **Verification Highlights**: 4 assessment inputs, TomTom commercial truck routing, 70hr/8day HOS engine with fuel stops, 10-hr resets, and authentic FMCSA 49 CFR § 395.8 printable 24-hour log projections with 70-hr rolling recaps.

---

## Regulatory References

- [FMCSA 49 CFR Part 395 Regulations](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations)
- [FMCSA Interstate Truck Driver's Guide to HOS (April 2022)](https://www.fmcsa.dot.gov/regulations/hours-service/interstate-truck-drivers-guide-hours-service)
- [Technical Architecture & Specifications](docs/architecture.md)
