import type { PlanEvent, Position, RouteResponse } from './api'

export type MapMarker = {
  color: string
  label: string
  position: Position
  kind: string
  symbol: string
  dutyStatus: string
  durationMinutes: number
  reason: string
  time: string
  distanceMiles?: number
}

const markerConfig: Record<string, { color: string; symbol: string; label: string }> = {
  pickup_service: { color: '#ec7e27', symbol: '📦', label: 'Pickup Service' },
  dropoff_service: { color: '#3ba272', symbol: '🏁', label: 'Dropoff Service' },
  fuel_stop: { color: '#2b6cb0', symbol: '⛽', label: 'Fuel Stop' },
  required_break: { color: '#805ad5', symbol: '☕', label: 'Required Break' },
  daily_reset: { color: '#805ad5', symbol: '🛏️', label: 'Daily Reset' },
  cycle_restart: { color: '#805ad5', symbol: '🔄', label: 'Cycle Restart' },
}

function approximatePosition(points: Array<[number, number]>, fraction: number): Position | null {
  if (!points.length) return null
  const index = Math.min(points.length - 1, Math.max(0, Math.round((points.length - 1) * fraction)))
  return { lat: points[index][0], lng: points[index][1] }
}

function formatTime(isoStr: string): string {
  const match = isoStr.match(/T(\d{2}):(\d{2})/)
  if (!match) return isoStr
  const h = Number(match[1])
  return `${h % 12 || 12}:${match[2]} ${h >= 12 ? 'PM' : 'AM'}`
}

export function deriveMapMarkers(route: RouteResponse, events: PlanEvent[]): MapMarker[] {
  const markers: MapMarker[] = []
  const drivingTotal = events
    .filter((event) => event.dutyStatus === 'driving')
    .reduce((sum, event) => sum + event.durationMinutes, 0)
  let drivingElapsed = 0

  for (const event of events) {
    if (event.dutyStatus === 'driving') {
      drivingElapsed += event.durationMinutes
      continue
    }
    const config = markerConfig[event.kind]
    if (!config) continue

    const position =
      event.location?.position ??
      approximatePosition(route.geometry, drivingTotal ? drivingElapsed / drivingTotal : 0)

    if (position) {
      markers.push({
        color: config.color,
        symbol: config.symbol,
        label: config.label,
        position,
        kind: event.kind,
        dutyStatus: event.dutyStatus,
        durationMinutes: event.durationMinutes,
        reason: event.reason,
        time: formatTime(event.start),
        distanceMiles: event.distanceMiles,
      })
    }
  }
  return markers
}
