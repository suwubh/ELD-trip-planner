import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RouteMap } from './RouteMap'
import { deriveMapMarkers } from './routeMapMarkers'

describe('route map', () => {
  it('explains the fallback when no route geometry is available', () => {
    render(<RouteMap route={{ distanceMiles: 0, durationMinutes: 0, geometry: [] }} events={[]} />)

    expect(screen.getByRole('status')).toHaveTextContent(/route geometry is unavailable/i)
  })

  it('maps service and required-stop events to distinct marker treatments', () => {
    const route = { distanceMiles: 1_100, durationMinutes: 660, geometry: [[41, -88], [40, -87], [39, -86]] as Array<[number, number]> }
    const events = [
      { kind: 'driving', dutyStatus: 'driving' as const, start: '2026-09-09T08:00:00-05:00', end: '2026-09-09T16:00:00-05:00', durationMinutes: 480, required: false, reason: '', location: null },
      { kind: 'fuel_stop', dutyStatus: 'on_duty_not_driving' as const, start: '2026-09-09T16:00:00-05:00', end: '2026-09-09T16:30:00-05:00', durationMinutes: 30, required: true, reason: '', location: null },
      { kind: 'pickup_service', dutyStatus: 'on_duty_not_driving' as const, start: '2026-09-09T16:30:00-05:00', end: '2026-09-09T17:30:00-05:00', durationMinutes: 60, required: true, reason: '', location: { label: 'Pickup', address: null, position: { lat: 39.5, lng: -86.5 } } },
    ]

    expect(deriveMapMarkers(route, events)).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Fuel Stop', color: '#2b6cb0' }),
      expect.objectContaining({ label: 'Pickup Service', color: '#ec7e27', position: { lat: 39.5, lng: -86.5 } }),
    ]))
  })
})
