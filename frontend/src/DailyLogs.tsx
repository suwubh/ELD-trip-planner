import type { DailyLog, PlannedLocation } from './api'
import './DailyLogs.css'

type DailyLogsProps = {
  logs: DailyLog[]
  locations: { current: PlannedLocation; pickup: PlannedLocation; dropoff: PlannedLocation }
}

const statusRows = [
  { key: 'off_duty', label: '1. Off duty', color: '#805ad5' },
  { key: 'sleeper_berth', label: '2. Sleeper berth', color: '#6b46c1' },
  { key: 'driving', label: '3. Driving', color: '#2b6cb0' },
  { key: 'on_duty_not_driving', label: '4. On duty (not driving)', color: '#ec7e27' },
] as const

const GRID_X = 220
const GRID_WIDTH = 820
const GRID_Y = 225
const ROW_HEIGHT = 50

function minutesForDate(value: string, date: string, isEnd = false): number {
  const valueDate = value.slice(0, 10)
  if (valueDate > date) return isEnd ? 1_440 : 0
  if (valueDate < date) return isEnd ? 1_440 : 0
  const match = value.match(/T(\d{2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours}:${String(remainder).padStart(2, '0')}`
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

function segmentLabel(kind: string) {
  return kind.replaceAll('_', ' ')
}

export function DailyLogs({ logs, locations }: DailyLogsProps) {
  return <section className="daily-logs" aria-labelledby="daily-logs-title">
    <div className="daily-logs-heading"><div><p className="section-kicker">Driver records</p><h3 id="daily-logs-title">Daily ELD logs</h3><p>Generated from the scheduled timeline. Each sheet uses local trip time and prints one day per page.</p></div><button type="button" className="print-logs" onClick={() => window.print()}>Print / save PDF</button></div>
    <div className="log-sheets">{logs.map((log) => <DailyLogSheet key={log.date} log={log} locations={locations} />)}</div>
  </section>
}

function DailyLogSheet({ log, locations }: { log: DailyLog; locations: DailyLogsProps['locations'] }) {
  const routeLabel = `${locations.current.label} → ${locations.pickup.label} → ${locations.dropoff.label}`
  const requiredRemarks = log.remarks.length ? log.remarks : ['No required HOS stops recorded for this calendar day.']

  return <article className="daily-log-sheet" aria-label={`Daily log: ${formatDate(log.date)}`}>
    <svg viewBox="0 0 1100 650" role="img" aria-labelledby={`log-title-${log.date} log-description-${log.date}`}>
      <title id={`log-title-${log.date}`}>Driver daily log for {formatDate(log.date)}</title>
      <desc id={`log-description-${log.date}`}>A 24-hour duty-status grid with off-duty, sleeper berth, driving, and on-duty-not-driving events.</desc>
      <rect x="1" y="1" width="1098" height="648" rx="5" className="log-paper" />
      <text x="45" y="50" className="log-title">Driver&apos;s Daily Log</text><text x="45" y="75" className="log-subtitle">Generated trip record · 24-hour local time</text>
      <text x="805" y="49" className="log-field-label">DATE</text><text x="805" y="75" className="log-field-value">{formatDate(log.date)}</text>
      <line x1="45" y1="100" x2="1055" y2="100" className="log-rule" />
      <text x="45" y="130" className="log-field-label">ROUTE</text><text x="45" y="152" className="log-field-value">{routeLabel}</text>
      <text x="720" y="130" className="log-field-label">CARRIER</text><text x="720" y="152" className="log-field-value">Linehaul Ledger</text>

      <rect x={GRID_X} y={GRID_Y} width={GRID_WIDTH} height={ROW_HEIGHT * statusRows.length} className="log-grid-outline" />
      {statusRows.map((row, index) => <g key={row.key}><text x="45" y={GRID_Y + index * ROW_HEIGHT + 30} className="log-row-label">{row.label}</text><line x1={GRID_X} y1={GRID_Y + index * ROW_HEIGHT} x2={GRID_X + GRID_WIDTH} y2={GRID_Y + index * ROW_HEIGHT} className="log-rule" /></g>)}
      {Array.from({ length: 25 }, (_, hour) => <g key={hour}><line x1={GRID_X + (hour / 24) * GRID_WIDTH} y1={GRID_Y} x2={GRID_X + (hour / 24) * GRID_WIDTH} y2={GRID_Y + ROW_HEIGHT * statusRows.length} className={hour % 6 === 0 ? 'log-hour-major' : 'log-hour'} />{hour < 24 && <text x={GRID_X + (hour / 24) * GRID_WIDTH + 3} y={GRID_Y - 12} className="log-hour-label">{hour === 0 ? 'Midnight' : hour === 12 ? 'Noon' : hour}</text>}</g>)}
      {log.events.map((event, index) => {
        const row = statusRows.findIndex((status) => status.key === event.dutyStatus)
        if (row < 0) return null
        const start = minutesForDate(event.start, log.date)
        const end = minutesForDate(event.end, log.date, true)
        const x1 = GRID_X + (start / 1_440) * GRID_WIDTH
        const x2 = GRID_X + (Math.max(start + 1, end) / 1_440) * GRID_WIDTH
        return <g key={`${event.start}-${index}`} data-testid="log-segment"><line x1={x1} y1={GRID_Y + row * ROW_HEIGHT + ROW_HEIGHT / 2} x2={x2} y2={GRID_Y + row * ROW_HEIGHT + ROW_HEIGHT / 2} stroke={statusRows[row].color} className="log-event-segment" /><title>{segmentLabel(event.kind)}: {formatMinutes(event.durationMinutes)}</title></g>
      })}

      <text x="45" y="465" className="log-field-label">STATUS TOTALS</text>
      {statusRows.map((status, index) => <g key={status.key}><rect x={45 + index * 250} y="480" width="225" height="52" rx="3" className="log-total-box" /><text x={58 + index * 250} y="502" className="log-total-label">{status.label.replace(/^\d\. /, '')}</text><text x={58 + index * 250} y="523" className="log-total-value">{formatMinutes(log.totalsMinutes[status.key] ?? 0)}</text></g>)}
      <text x="45" y="570" className="log-field-label">REMARKS</text><line x1="45" y1="580" x2="1055" y2="580" className="log-rule" />
      {requiredRemarks.slice(0, 2).map((remark, index) => <text key={remark} x="45" y={604 + index * 20} className="log-remark">• {remark}</text>)}
    </svg>
  </article>
}
