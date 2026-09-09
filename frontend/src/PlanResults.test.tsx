import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TripPlanResponse } from './api'
import { PlanResults } from './PlanResults'

vi.mock('./RouteMap', () => ({ RouteMap: () => <div aria-label="Planned truck route map">Map rendered</div> }))

const plan: TripPlanResponse = {
  trip: {
    startTime: '2026-09-09T08:00:00-05:00',
    locations: {
      current: { label: 'Chicago, IL', address: null, position: { lat: 41.8781, lng: -87.6298 } },
      pickup: { label: 'Indianapolis, IN', address: null, position: { lat: 39.7684, lng: -86.1581 } },
      dropoff: { label: 'Columbus, OH', address: null, position: { lat: 39.9612, lng: -82.9988 } },
    },
  },
  route: { distanceMiles: 359, durationMinutes: 410, geometry: [[41.8781, -87.6298], [39.7684, -86.1581], [39.9612, -82.9988]] },
  compliance: { isCompliant: true, drivingHoursRemaining: 4.2, dailyWindowHoursRemaining: 6.1, cycleHoursRemaining: 20.5, summary: 'Trip is scheduled within the modeled HOS limits.', nextRequiredStop: null },
  events: [],
  itinerary: [
    { id: 'event-001', kind: 'driving', dutyStatus: 'driving', start: '2026-09-09T08:00:00-05:00', end: '2026-09-09T11:30:00-05:00', durationMinutes: 210, required: false, reason: 'Driving planned route segment.', location: null },
    { id: 'event-002', kind: 'pickup_service', dutyStatus: 'on_duty_not_driving', start: '2026-09-09T11:30:00-05:00', end: '2026-09-09T12:30:00-05:00', durationMinutes: 60, required: true, reason: 'One hour of on-duty time for pickup.', location: { label: 'Indianapolis, IN', address: null, position: { lat: 39.7684, lng: -86.1581 } } },
  ],
}

describe('plan results', () => {
  it('shows the map, capacity rail, and chronological itinerary', () => {
    render(<PlanResults plan={plan} />)

    expect(screen.getByLabelText(/planned truck route map/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /route, compliance, and stops/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/hours of service compliance/i)).toHaveTextContent('4.2 hr left')
    expect(screen.getAllByText('Driving segment')[0]).toBeInTheDocument()
    expect(screen.getByText('Pickup service')).toBeInTheDocument()
    expect(screen.getByText('Indianapolis, IN')).toBeInTheDocument()
    const firstTime = screen.getByText('8:00 AM')
    const secondTime = screen.getByText('11:30 AM')
    expect(firstTime.compareDocumentPosition(secondTime) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
