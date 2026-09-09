import type { PlanEvent, Position, RouteResponse } from './api'

export type MapMarker = {
  color: string
  label: string
  position: Position
}

const markerColors: Record<string, string> = {
  pickup_service: '#ec7e27',
  dropoff_service: '#3ba272',
  fuel_stop: '#2b6cb0',
  required_break: '#805ad5',
  daily_reset: '#805ad5',
  cycle_restart: '#805ad5',
}

function eventLabel(event: PlanEvent): string {
  return event.kind.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function approximatePosition(points: Array<[number, number]>, fraction: number): Position | null {
  if (!points.length) return null
  const index = Math.min(points.length - 1, Math.max(0, Math.round((points.length - 1) * fraction)))
  return { lat: points[index][0], lng: points[index][1] }
}

export function deriveMapMarkers(route: RouteResponse, events: PlanEvent[]): MapMarker[] {
  const markers: MapMarker[] = []
  const drivingTotal = events.filter((event) => event.dutyStatus === 'driving').reduce((sum, event) => sum + event.durationMinutes, 0)
  let drivingElapsed = 0

  for (const event of events) {
    if (event.dutyStatus === 'driving') {
      drivingElapsed += event.durationMinutes
      continue
    }
    if (!(event.kind in markerColors)) continue
    const position = event.location?.position ?? approximatePosition(route.geometry, drivingTotal ? drivingElapsed / drivingTotal : 0)
    if (position) markers.push({ color: markerColors[event.kind], label: eventLabel(event), position })
  }
  return markers
}
