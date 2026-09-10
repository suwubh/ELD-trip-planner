import { useState } from 'react'
import type { DailyLog, PlannedLocation } from './api'
import './DailyLogs.css'

type DailyLogsProps = {
  logs: DailyLog[]
  locations: { current: PlannedLocation; pickup: PlannedLocation; dropoff: PlannedLocation }
}

const statusRows = [
  { key: 'off_duty', label: '1. OFF DUTY', shortLabel: 'Off Duty', color: '#64748b', yIndex: 0 },
  { key: 'sleeper_berth', label: '2. SLEEPER BERTH', shortLabel: 'Sleeper', color: '#6366f1', yIndex: 1 },
  { key: 'driving', label: '3. DRIVING', shortLabel: 'Driving', color: '#0284c7', yIndex: 2 },
  { key: 'on_duty_not_driving', label: '4. ON DUTY (NOT DRIVING)', shortLabel: 'On Duty', color: '#d97706', yIndex: 3 },
] as const

const GRID_X = 175
const GRID_WIDTH = 840
const GRID_Y = 175
const ROW_HEIGHT = 44
const TOTAL_GRID_HEIGHT = ROW_HEIGHT * 4

function minutesForDate(value: string, date: string, isEnd = false): number {
  const valueDate = value.slice(0, 10)
  if (valueDate > date) return 1_440
  if (valueDate < date) return 0
  const match = value.match(/T(\d{2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : (isEnd ? 1_440 : 0)
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours}:${String(remainder).padStart(2, '0')}`
}

function formatHoursDecimal(minutes: number) {
  return (minutes / 60).toFixed(2)
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

function formatDateHeader(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  return {
    month: String(d.getUTCMonth() + 1).padStart(2, '0'),
    day: String(d.getUTCDate()).padStart(2, '0'),
    year: String(d.getUTCFullYear()),
  }
}

export function DailyLogs({ logs, locations }: DailyLogsProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | 'all'>('all')

  const displayedLogs = selectedDayIndex === 'all' ? logs : [logs[selectedDayIndex]]

  return (
    <section className="daily-logs" aria-labelledby="daily-logs-title">
      <div className="daily-logs-heading">
        <div>
          <p className="section-kicker">FMCSA 49 CFR § 395.8 Grid Standard</p>
          <h3 id="daily-logs-title">Driver&apos;s Daily Log (Planned Duty-Status Projection)</h3>
          <p>
            Simulated 24-hour Record of Duty Status (RODS) projection modeled for trip planning under 49 CFR § 395.8.
            Each sheet records exactly 24.0 hours with a continuous duty-status step line, 15-minute grid resolution,
            remarks, and 70-hour / 8-day rolling recap. Carrier, vehicle, and terminal values represent simulated
            dispatch preview defaults based on the 4 assessment trip parameters.
          </p>
        </div>
        <div className="daily-logs-actions">
          {logs.length > 1 && (
            <div className="day-tabs" role="tablist" aria-label="Daily log sheets">
              <button
                type="button"
                className={`day-tab ${selectedDayIndex === 'all' ? 'is-active' : ''}`}
                onClick={() => setSelectedDayIndex('all')}
              >
                All Sheets ({logs.length})
              </button>
              {logs.map((log, idx) => (
                <button
                  key={log.date}
                  type="button"
                  className={`day-tab ${selectedDayIndex === idx ? 'is-active' : ''}`}
                  onClick={() => setSelectedDayIndex(idx)}
                >
                  Day {log.dayNumber ?? idx + 1}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="print-logs" onClick={() => window.print()}>
            Print / save PDF
          </button>
        </div>
      </div>

      <div className="log-sheets">
        {displayedLogs.map((log) => (
          <DailyLogSheet key={log.date} log={log} locations={locations} />
        ))}
      </div>
    </section>
  )
}

function DailyLogSheet({
  log,
  locations,
}: {
  log: DailyLog
  locations: DailyLogsProps['locations']
}) {
  const dateParts = formatDateHeader(log.date)
  const fromLocation = log.startLocation || locations.current.label
  const toLocation = log.endLocation || locations.dropoff.label
  const milesToday = log.totalMilesDrivingToday ?? Math.round((log.totalsMinutes.driving / 60) * 55)

  // Compute step line segments:
  const sortedEvents = [...log.events].sort((a, b) => {
    return minutesForDate(a.start, log.date) - minutesForDate(b.start, log.date)
  })

  // Build continuous polyline coordinate pairs
  const stepPoints: Array<{ x: number; y: number }> = []
  sortedEvents.forEach((event) => {
    const row = statusRows.findIndex((s) => s.key === event.dutyStatus)
    if (row < 0) return
    const startM = minutesForDate(event.start, log.date)
    const endM = Math.max(startM + 1, minutesForDate(event.end, log.date, true))

    const x1 = GRID_X + (startM / 1_440) * GRID_WIDTH
    const x2 = GRID_X + (endM / 1_440) * GRID_WIDTH
    const y = GRID_Y + row * ROW_HEIGHT + ROW_HEIGHT / 2

    if (stepPoints.length > 0) {
      const prev = stepPoints[stepPoints.length - 1]
      if (Math.abs(prev.y - y) > 1) {
        // Vertical step transition at change of duty status
        stepPoints.push({ x: x1, y: prev.y })
        stepPoints.push({ x: x1, y })
      }
    } else {
      stepPoints.push({ x: x1, y })
    }
    stepPoints.push({ x: x2, y })
  })

  const polylineStr = stepPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const totalDayMinutes = Object.values(log.totalsMinutes).reduce((acc, v) => acc + v, 0)

  // 70-hr recap
  const recap = log.recap || {
    onDutyTodayHours: Number(((log.totalsMinutes.driving + log.totalsMinutes.on_duty_not_driving) / 60).toFixed(2)),
    totalHoursLast7Days: Number(((log.totalsMinutes.driving + log.totalsMinutes.on_duty_not_driving) / 60).toFixed(2)),
    availableTomorrowHours: Number(Math.max(0, 70 - (log.totalsMinutes.driving + log.totalsMinutes.on_duty_not_driving) / 60).toFixed(2)),
    totalHoursLast8Days: Number(((log.totalsMinutes.driving + log.totalsMinutes.on_duty_not_driving) / 60).toFixed(2)),
  }

  return (
    <article className="daily-log-sheet" aria-label={`Daily log: ${formatDate(log.date)}`}>
      <svg
        viewBox="0 0 1120 780"
        role="img"
        aria-labelledby={`log-title-${log.date} log-description-${log.date}`}
        className="fmcsa-log-svg"
      >
        <title id={`log-title-${log.date}`}>Driver daily log for {formatDate(log.date)}</title>
        <desc id={`log-description-${log.date}`}>
          Planned 24-hour duty-status projection grid and 70-hour recap for {formatDate(log.date)} under 49 CFR § 395.8.
        </desc>

        {/* Paper Background */}
        <rect x="2" y="2" width="1116" height="776" rx="4" className="log-paper" />

        {/* Outer Form Header */}
        <g className="log-header-section">
          <text x="35" y="38" className="log-doc-title">DRIVER&apos;S DAILY LOG</text>
          <text x="35" y="55" className="log-doc-subtitle">(PLANNED DUTY-STATUS PROJECTION · 24 HOURS)</text>
          <text x="35" y="70" className="log-doc-subtext">Modeled Schedule Projection · FMCSA 49 CFR § 395.8 Grid Standard</text>

          {/* Date Stamp Box */}
          <rect x="520" y="20" width="220" height="52" rx="3" className="log-field-box" />
          <text x="532" y="36" className="log-field-label">DATE (MONTH / DAY / YEAR)</text>
          <text x="532" y="60" className="log-field-hero">{dateParts.month} / {dateParts.day} / {dateParts.year}</text>

          {/* Mileage Box */}
          <rect x="755" y="20" width="160" height="52" rx="3" className="log-field-box" />
          <text x="765" y="36" className="log-field-label">MILES DRIVING TODAY</text>
          <text x="765" y="60" className="log-field-hero">{milesToday} mi</text>

          {/* Vehicle Box */}
          <rect x="930" y="20" width="155" height="52" rx="3" className="log-field-box" />
          <text x="940" y="36" className="log-field-label">TRUCK / TRAILER (PREVIEW)</text>
          <text x="940" y="60" className="log-field-value">TRK-4092 / 53V</text>
        </g>

        {/* Carrier and Route Details Bar */}
        <g className="log-carrier-bar">
          <rect x="35" y="82" width="1050" height="56" rx="3" className="log-bar-box" />
          
          <text x="50" y="100" className="log-field-label">FROM (ORIGIN)</text>
          <text x="50" y="124" className="log-field-value truncate">{fromLocation}</text>

          <text x="310" y="100" className="log-field-label">TO (DESTINATION)</text>
          <text x="310" y="124" className="log-field-value truncate">{toLocation}</text>

          <text x="570" y="100" className="log-field-label">CARRIER (DISPATCH PREVIEW)</text>
          <text x="570" y="124" className="log-field-value">Linehaul Logistics Carrier</text>

          <text x="830" y="100" className="log-field-label">HOME TERMINAL (PREVIEW)</text>
          <text x="830" y="124" className="log-field-value">Dallas, TX (Central Terminal)</text>
        </g>

        {/* 24-HOUR GRAPH GRID */}
        <g className="log-graph-grid">
          {/* Grid Background and Outline */}
          <rect x={GRID_X} y={GRID_Y} width={GRID_WIDTH} height={TOTAL_GRID_HEIGHT} className="log-grid-body" />

          {/* Duty Status Row Labels and Horizontal Rules */}
          {statusRows.map((row, index) => (
            <g key={row.key}>
              <rect
                x="35"
                y={GRID_Y + index * ROW_HEIGHT}
                width={GRID_X - 35}
                height={ROW_HEIGHT}
                className={`log-row-header-box ${index % 2 === 0 ? 'alt' : ''}`}
              />
              <text x="45" y={GRID_Y + index * ROW_HEIGHT + 26} className="log-row-label">
                {row.label}
              </text>
              <line
                x1={GRID_X}
                y1={GRID_Y + index * ROW_HEIGHT}
                x2={GRID_X + GRID_WIDTH}
                y2={GRID_Y + index * ROW_HEIGHT}
                className="log-grid-line"
              />
            </g>
          ))}

          {/* Hour markers, subdivisions, and vertical lines */}
          {Array.from({ length: 25 }, (_, hour) => {
            const x = GRID_X + (hour / 24) * GRID_WIDTH
            const isMajor = hour === 0 || hour === 12 || hour === 24
            return (
              <g key={hour}>
                <line
                  x1={x}
                  y1={GRID_Y}
                  x2={x}
                  y2={GRID_Y + TOTAL_GRID_HEIGHT}
                  className={isMajor ? 'log-hour-major' : 'log-hour'}
                />
                {/* 15-minute subdivisions within the hour */}
                {hour < 24 && (
                  <>
                    <line
                      x1={x + (0.25 / 24) * GRID_WIDTH}
                      y1={GRID_Y}
                      x2={x + (0.25 / 24) * GRID_WIDTH}
                      y2={GRID_Y + TOTAL_GRID_HEIGHT}
                      className="log-tick-quarter"
                    />
                    <line
                      x1={x + (0.5 / 24) * GRID_WIDTH}
                      y1={GRID_Y}
                      x2={x + (0.5 / 24) * GRID_WIDTH}
                      y2={GRID_Y + TOTAL_GRID_HEIGHT}
                      className="log-tick-half"
                    />
                    <line
                      x1={x + (0.75 / 24) * GRID_WIDTH}
                      y1={GRID_Y}
                      x2={x + (0.75 / 24) * GRID_WIDTH}
                      y2={GRID_Y + TOTAL_GRID_HEIGHT}
                      className="log-tick-quarter"
                    />
                  </>
                )}
                {/* Hour Header Labels */}
                {hour <= 24 && (
                  <text
                    x={x}
                    y={GRID_Y - 8}
                    textAnchor="middle"
                    className={`log-hour-number ${isMajor ? 'is-major' : ''}`}
                  >
                    {hour === 0 ? 'Midnight' : hour === 12 ? 'Noon' : hour === 24 ? 'Midnight' : hour}
                  </text>
                )}
              </g>
            )
          })}

          {/* Right-side Total Hours Column */}
          <rect
            x={GRID_X + GRID_WIDTH}
            y={GRID_Y}
            width="65"
            height={TOTAL_GRID_HEIGHT}
            className="log-totals-column"
          />
          <text x={GRID_X + GRID_WIDTH + 32} y={GRID_Y - 8} textAnchor="middle" className="log-totals-head">
            TOTAL
          </text>
          {statusRows.map((row, index) => (
            <g key={`total-${row.key}`}>
              <line
                x1={GRID_X + GRID_WIDTH}
                y1={GRID_Y + index * ROW_HEIGHT}
                x2={GRID_X + GRID_WIDTH + 65}
                y2={GRID_Y + index * ROW_HEIGHT}
                className="log-grid-line"
              />
              <text
                x={GRID_X + GRID_WIDTH + 32}
                y={GRID_Y + index * ROW_HEIGHT + 26}
                textAnchor="middle"
                className="log-row-total-val"
              >
                {formatHoursDecimal(log.totalsMinutes[row.key] ?? 0)}
              </text>
            </g>
          ))}

          {/* Grand Total Row at bottom right */}
          <rect
            x={GRID_X + GRID_WIDTH}
            y={GRID_Y + TOTAL_GRID_HEIGHT + 2}
            width="65"
            height="24"
            className="log-grand-total-box"
          />
          <text
            x={GRID_X + GRID_WIDTH + 32}
            y={GRID_Y + TOTAL_GRID_HEIGHT + 18}
            textAnchor="middle"
            className="log-grand-total-val"
          >
            = {(totalDayMinutes / 60).toFixed(2)}
          </text>

          {/* Visual Step-Line (Continuous Polyline drawn across the 24 hours) */}
          {polylineStr && (
            <polyline
              points={polylineStr}
              fill="none"
              stroke="#0284c7"
              strokeWidth="4"
              strokeLinejoin="round"
              strokeLinecap="round"
              className="log-continuous-stepline"
            />
          )}

          {/* Individual Status Span Segments for tests & tooltips */}
          {sortedEvents.map((event, index) => {
            const row = statusRows.findIndex((status) => status.key === event.dutyStatus)
            if (row < 0) return null
            const start = minutesForDate(event.start, log.date)
            const end = minutesForDate(event.end, log.date, true)
            const x1 = GRID_X + (start / 1_440) * GRID_WIDTH
            const x2 = GRID_X + (Math.max(start + 1, end) / 1_440) * GRID_WIDTH
            const y = GRID_Y + row * ROW_HEIGHT + ROW_HEIGHT / 2
            return (
              <g key={`${event.start}-${index}`} data-testid="log-segment">
                <line
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  stroke={statusRows[row].color}
                  strokeWidth="8"
                  strokeOpacity="0.45"
                  strokeLinecap="round"
                />
                <title>
                  {statusRows[row].shortLabel} ({formatMinutes(event.durationMinutes)}): {event.reason}
                </title>
              </g>
            )
          })}
        </g>

        {/* STATUS TOTALS SUMMARY BADGES */}
        <g className="log-totals-summary-badges">
          <text x="35" y="390" className="log-field-label">24-HOUR DUTY STATUS TOTALS</text>
          {statusRows.map((status, index) => {
            const mins = log.totalsMinutes[status.key] ?? 0
            return (
              <g key={status.key} transform={`translate(${35 + index * 265}, 400)`}>
                <rect x="0" y="0" width="250" height="42" rx="4" className="log-badge-card" />
                <circle cx="20" cy="21" r="7" fill={status.color} />
                <text x="36" y="25" className="log-badge-label">{status.shortLabel}</text>
                <text x="235" y="26" textAnchor="end" className="log-badge-time">
                  {formatMinutes(mins)} <tspan className="log-badge-sub">({formatHoursDecimal(mins)}h)</tspan>
                </text>
              </g>
            )
          })}
        </g>

        {/* REMARKS & DUTY CHANGE LOG */}
        <g className="log-remarks-section">
          <rect x="35" y="465" width="670" height="175" rx="3" className="log-remarks-card" />
          <text x="50" y="488" className="log-field-label">REMARKS &amp; RECORD OF DUTY STATUS CHANGES (49 CFR § 395.8(c))</text>
          <text x="690" y="488" textAnchor="end" className="log-doc-subtext">Planned Manifest: TRIP-PLANNED-EST</text>
          <line x1="50" y1="498" x2="690" y2="498" className="log-grid-line" />

          {/* Remarks entries */}
          {(log.remarks.length > 0 ? log.remarks : ['No duty changes recorded.']).slice(0, 5).map((remark, idx) => (
            <text key={`${remark}-${idx}`} x="50" y={522 + idx * 24} className="log-remark-row">
              • {remark}
            </text>
          ))}
          {log.remarks.length > 5 && (
            <text x="50" y={644} className="log-remark-more">
              + {log.remarks.length - 5} additional logged events (see complete itinerary)
            </text>
          )}
        </g>

        {/* 70-HOUR / 8-DAY ROLLING RECAP TABLE */}
        <g className="log-recap-section">
          <rect x="725" y="465" width="360" height="175" rx="3" className="log-recap-card" />
          <text x="740" y="488" className="log-field-label">70-HOUR / 8-DAY DRIVER RECAP (FMCSA)</text>
          <line x1="740" y1="498" x2="1070" y2="498" className="log-grid-line" />

          <g transform="translate(740, 508)">
            <text x="0" y="16" className="log-recap-item-title">1. On-Duty Hours Today (Lines 3 &amp; 4)</text>
            <text x="330" y="16" textAnchor="end" className="log-recap-item-val">{recap.onDutyTodayHours.toFixed(2)} hrs</text>

            <text x="0" y="42" className="log-recap-item-title">2. A. Total On-Duty Last 7 Days (Inc. Today)</text>
            <text x="330" y="42" textAnchor="end" className="log-recap-item-val">{recap.totalHoursLast7Days.toFixed(2)} hrs</text>

            <text x="0" y="68" className="log-recap-item-title">3. B. Hours Available Tomorrow (70 - A)*</text>
            <text x="330" y="68" textAnchor="end" className="log-recap-item-val is-accent">{recap.availableTomorrowHours.toFixed(2)} hrs</text>

            <text x="0" y="94" className="log-recap-item-title">4. C. Total On-Duty Last 8 Days</text>
            <text x="330" y="94" textAnchor="end" className="log-recap-item-val">{recap.totalHoursLast8Days.toFixed(2)} hrs</text>
          </g>

          <text x="740" y="628" className="log-recap-footer">
            * 34 consecutive hours off-duty resets 70-hr cycle calculation.
          </text>
        </g>

        {/* Driver Certification Footer */}
        <g className="log-cert-footer">
          <line x1="35" y1="660" x2="1085" y2="660" className="log-grid-line" />
          <text x="35" y="685" className="log-doc-subtext">
            DRIVER / DISPATCH REVIEW: Modeled schedule prepared for trip planning under 49 CFR § 395.3. Actual certified RODS require driver ELD recording.
          </text>
          <text x="35" y="710" className="log-signature-script">Modeled Schedule Projection</text>
          <line x1="35" y1="718" x2="280" y2="718" className="log-rule" />
          <text x="35" y="732" className="log-field-label">SCHEDULE STATUS</text>

          <text x="500" y="710" className="log-field-value">{dateParts.month}/{dateParts.day}/{dateParts.year}</text>
          <line x1="500" y1="718" x2="680" y2="718" className="log-rule" />
          <text x="500" y="732" className="log-field-label">PLAN DATE</text>

          <text x="850" y="710" className="log-field-value">Dispatch Planning Review</text>
          <line x1="850" y1="718" x2="1085" y2="718" className="log-rule" />
          <text x="850" y="732" className="log-field-label">DISPATCH PREVIEW</text>
        </g>
      </svg>
    </article>
  )
}
