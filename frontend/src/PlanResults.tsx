import type { PlanEvent, TripPlanResponse } from './api'
import { DailyLogs } from './DailyLogs'
import { RouteMap } from './RouteMap'
import './PlanResults.css'

type PlanResultsProps = { plan: TripPlanResponse }

const eventNames: Record<string, string> = {
  driving: 'Driving segment',
  pickup_service: 'Pickup service',
  dropoff_service: 'Delivery service',
  fuel_stop: 'Fuel stop',
  required_break: 'Required break',
  daily_reset: '10-hour daily reset',
  cycle_restart: '34-hour cycle restart',
}

const statusNames: Record<PlanEvent['dutyStatus'], string> = {
  off_duty: 'Off duty',
  sleeper_berth: 'Sleeper berth',
  driving: 'Driving',
  on_duty_not_driving: 'On duty',
}

function eventName(event: PlanEvent) {
  return eventNames[event.kind] ?? event.kind.replaceAll('_', ' ')
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`
}

function formatTime(value: string) {
  const match = value.match(/T(\d{2}):(\d{2})/)
  if (!match) return value
  const hour = Number(match[1])
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`
}

function Capacity({ label, remaining, total }: { label: string; remaining: number; total: number }) {
  const used = Math.max(0, Math.min(100, ((total - remaining) / total) * 100))
  return (
    <div className="capacity">
      <div>
        <span>{label}</span>
        <strong>{remaining.toFixed(1)} hr left</strong>
      </div>
      <div
        className="capacity-track"
        aria-label={`${label}: ${remaining.toFixed(1)} of ${total} hours remaining`}
      >
        <i style={{ width: `${used}%` }} />
      </div>
    </div>
  )
}

export function PlanResults({ plan }: PlanResultsProps) {
  if (!plan.trip || !plan.route.geometry) return null
  const { compliance, route, trip } = plan
  const itinerary = plan.itinerary ?? plan.events
  const hasRequiredStop = itinerary.some(
    (event) => event.required && !['pickup_service', 'dropoff_service'].includes(event.kind)
  )

  const nextStop = compliance.nextRequiredStop

  return (
    <section className="results" aria-labelledby="results-title">
      <div className="results-heading">
        <div>
          <p className="section-kicker">Dispatch View</p>
          <h2 id="results-title">Route, compliance, and stops</h2>
          <p>
            {trip.locations.current.label} to {trip.locations.dropoff.label} via{' '}
            {trip.locations.pickup.label}
          </p>
        </div>
        <span
          className={`compliance-pill ${
            compliance.isCompliant ? 'is-compliant' : 'needs-review'
          }`}
        >
          {compliance.isCompliant ? 'Within modeled limits' : 'Review required'}
        </span>
      </div>

      <div className="route-summary" aria-label="Route summary">
        <div>
          <span>Truck route</span>
          <strong>{route.distanceMiles.toLocaleString()} mi</strong>
        </div>
        <div>
          <span>Drive time</span>
          <strong>{formatDuration(route.durationMinutes)}</strong>
        </div>
        <div>
          <span>Scheduled events</span>
          <strong>{itinerary.length}</strong>
        </div>
        <div>
          <span>Required stops</span>
          <strong>{itinerary.filter((event) => event.required).length}</strong>
        </div>
      </div>

      <div className="results-grid">
        <div className="map-card">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Route Map</p>
              <h3>Truck-optimized route</h3>
            </div>
            <span className="provider-tag">OpenStreetMap + TomTom Routing</span>
          </div>
          <RouteMap route={route} events={plan.events} />
        </div>

        <aside className="compliance-card" aria-label="Hours of Service compliance">
          <p className="section-kicker">HOS Capacity</p>
          <h3>{compliance.isCompliant ? 'Ready to run' : 'Attention required'}</h3>
          <p>{compliance.summary}</p>
          <div className="capacity-list">
            <Capacity
              label="Driving"
              remaining={compliance.drivingHoursRemaining ?? 0}
              total={11}
            />
            <Capacity
              label="14-hour window"
              remaining={compliance.dailyWindowHoursRemaining ?? 0}
              total={14}
            />
            <Capacity
              label="70-hour cycle"
              remaining={compliance.cycleHoursRemaining}
              total={70}
            />
          </div>
          <div className="next-stop">
            <span>Next required stop</span>
            <strong>
              {nextStop
                ? `${eventName(nextStop)} (${formatTime(nextStop.start)})`
                : hasRequiredStop
                ? 'Scheduled in itinerary'
                : 'No additional stop required'}
            </strong>
            {nextStop?.reason ? (
              <p>{nextStop.reason}</p>
            ) : (
              <p>Driver is compliant with FMCSA 70hr/8day property-carrying rules.</p>
            )}
          </div>
        </aside>
      </div>

      <section className="itinerary-card" aria-labelledby="itinerary-title">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Timeline</p>
            <h3 id="itinerary-title">Driver itinerary</h3>
          </div>
          <span>{itinerary.length} scheduled events</span>
        </div>
        <ol className="itinerary">
          {itinerary.map((event, index) => (
            <li
              key={event.id ?? `${event.start}-${index}`}
              className={event.required ? 'is-required' : ''}
            >
              <time dateTime={event.start}>{formatTime(event.start)}</time>
              <span className={`timeline-dot ${event.dutyStatus}`} aria-hidden="true" />
              <div>
                <div className="event-title">
                  <strong>{eventName(event)}</strong>
                  {event.required && <em>Required Stop</em>}
                </div>
                <p>{event.reason}</p>
                {event.location && <small>{event.location.label}</small>}
              </div>
              <span className="event-duration">
                {formatDuration(event.durationMinutes)} · {statusNames[event.dutyStatus]}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {plan.dailyLogs?.length ? (
        <DailyLogs logs={plan.dailyLogs} locations={trip.locations} />
      ) : null}
    </section>
  )
}
