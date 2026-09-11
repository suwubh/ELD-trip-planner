# Linehaul Ledger - ELD Trip Planner & Daily Log Generator

Hi there! I built this full-stack application for the Full Stack Developer assessment.

The goal was to create a tool that takes commercial truck trip inputs (current location, pickup, dropoff, and prior cycle hours) and outputs:
1. An interactive map with the truck route and all required stops (fuel, breaks, resets).
2. Complete, filled-out 24-hour Driver's Daily Log sheets (FMCSA 49 CFR § 395.8) drawn directly with continuous step-line graphs, remarks, and a 70-hour rolling recap.

---

## Quick Links

- **Live Application:** [https://eld-trip-planner-two-pi.vercel.app](https://eld-trip-planner-two-pi.vercel.app)
- **Loom Walkthrough:** [https://www.loom.com/share/07934fcc132a40c1b9f484772752e4c1](https://www.loom.com/share/07934fcc132a40c1b9f484772752e4c1)
- **GitHub Repository:** [https://github.com/suwubh/ELD-trip-planner](https://github.com/suwubh/ELD-trip-planner)

---

## How It Works

### 1. Trip Inputs
The app takes the four required inputs from the prompt:
- **Current Location** (where the driver starts)
- **Pickup Location** (automatically schedules 1 hour of on-duty loading service)
- **Dropoff Location** (automatically schedules 1 hour of on-duty unloading service)
- **Current Cycle Used** (0 to 70 hours from the past 8 days)

*I also added 1-click presets at the top (Regional Run, Multi-Day, and Coast-to-Coast) so you can test routes instantly without typing.*

### 2. Truck Routing & Free Map
- I used TomTom's Routing API on the server side configured with `travelMode=truck` and commercial parameters to calculate realistic highway distances and truck travel times.
- For the frontend map, I used **Leaflet and OpenStreetMap** (completely free, no paid client map tokens needed).
- Custom map pins mark where every pickup, delivery, 30-minute break, fuel stop, and overnight reset happens.

### 3. HOS Rules Engine (Property-Carrying 70hr / 8-Day)
I built the Hours of Service scheduler as a pure, deterministic Python module in `backend/trips/hos.py`. It doesn't rely on system clocks or databases, which made it easy to test every edge case:
- **11-Hour Driving Limit:** After 10 consecutive hours off duty, driving is capped at 11 hours.
- **14-Hour Duty Window:** Once the driver starts work, driving cannot continue after the 14th hour without taking 10 consecutive hours off.
- **30-Minute Rest Break:** Triggered after 8 cumulative hours of driving. Per FMCSA rules, any on-duty non-driving interruption (like 1 hour of loading or a 30-minute fuel stop) satisfies this break.
- **Fueling Cadence:** Automatically schedules a 30-minute on-duty fuel stop at least every 1,000 miles.
- **70-Hour / 8-Day Cycle & 34-Hour Restart:** If the driver reaches 70 on-duty hours, the scheduler inserts a 34-hour off-duty restart, resetting the rolling cycle back to zero.

### 4. Authentic 24-Hour ELD Daily Log Sheets
Instead of just displaying a summary table, I rendered full SVG daily log sheets inspired by official FMCSA paper logs (Form MCS-59):
- **24.0-Hour Timeline:** Each calendar day accounts for all 1,440 minutes with zero gaps.
- **Continuous Step-Line Graph:** Connects duty transitions vertically across all 4 statuses (Off Duty, Sleeper Berth, Driving, On Duty Not Driving).
- **15-Minute Ticks:** Each hour block is marked with quarter-hour grid lines.
- **Total Hours Column:** Totals for each duty status are calculated on the right and always sum up to exactly 24.00 hours.
- **Remarks & Locations:** Chronological duty changes with city/state and timestamps.
- **70-Hour Recap Table:** Shows on-duty hours today, rolling 7-day total, and hours available tomorrow.
- **Landscape Print Support:** Hitting "Print / save PDF" strips away the UI and uses CSS page breaks to print each day cleanly on its own landscape page.

---

## Tech Stack

- **Backend:** Python 3.12, Django 5.2, Django REST Framework
- **Frontend:** React 19, TypeScript, Vite
- **Maps:** Leaflet, React Leaflet, OpenStreetMap tiles
- **Routing API:** TomTom Commercial Truck Routing (kept securely server-side)
- **Styling:** Custom Vanilla CSS (clean, responsive, operator console aesthetic)
- **Testing:** Pytest (Django backend), Vitest + React Testing Library (frontend)

---

## Local Setup

### 1. Prerequisites
- Python 3.12+
- Node.js 20+
- A TomTom API key (free tier works great)

### 2. Environment Variables
Create a `.env` file in the project root (you can copy `.env.example`):

```env
DJANGO_SECRET_KEY=local-dev-secret-key-12345
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173
TOMTOM_API_KEY=your_tomtom_api_key_here
VITE_API_BASE_URL=http://localhost:8000
```

### 3. Run Backend (Django)
```bash
# Setup virtualenv and install dependencies
python -m venv .venv

# On Windows (PowerShell):
.\.venv\Scripts\activate

# On macOS/Linux:
# source .venv/bin/activate

pip install -r backend/requirements.txt
python backend/manage.py runserver 127.0.0.1:8000
```
The API will be live at `http://127.0.0.1:8000/api/v1/health/`.

### 4. Run Frontend (React)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Running Tests

I wrote automated unit and integration tests for both the backend scheduling engine and the frontend UI components:

```bash
# Backend pytest suite (30 tests covering HOS rules, TomTom client, and API validation)
pytest backend/

# Frontend Vitest suite (9 tests covering form inputs, map markers, and SVG log rendering)
cd frontend
npm test -- --run

# Lint check (0 errors, 0 warnings)
npm run lint

# Production build check
npm run build
```

---

## Deployment Instructions

### Backend (Render)
1. Link this repository to Render as a Web Service.
2. Root Directory: `backend`
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT`
5. Add Environment Variables in the Render dashboard:
   - `DJANGO_SECRET_KEY`: (generate a random 50-char string)
   - `DJANGO_DEBUG`: `false`
   - `DJANGO_ALLOWED_HOSTS`: `your-render-subdomain.onrender.com`
   - `DJANGO_CORS_ALLOWED_ORIGINS`: `https://your-vercel-app.vercel.app`
   - `TOMTOM_API_KEY`: (your TomTom API key)

### Frontend (Vercel)
1. Import the repository on Vercel.
2. Root Directory: `frontend`
3. Framework Preset: `Vite`
4. Add Environment Variable:
   - `VITE_API_BASE_URL`: `https://your-render-subdomain.onrender.com`
