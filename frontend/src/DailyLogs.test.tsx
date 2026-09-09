import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DailyLog } from './api'
import { DailyLogs } from './DailyLogs'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const locations = {
  current: { label: 'Chicago, IL', address: null, position: { lat: 41.8781, lng: -87.6298 } },
  pickup: { label: 'Indianapolis, IN', address: null, position: { lat: 39.7684, lng: -86.1581 } },
  dropoff: { label: 'Columbus, OH', address: null, position: { lat: 39.9612, lng: -82.9988 } },
}

const logs: DailyLog[] = [
  { date: '2026-09-09', events: [{ kind: 'driving', dutyStatus: 'driving', start: '2026-09-09T22:00:00-05:00', end: '2026-09-10T00:00:00-05:00', durationMinutes: 120, required: false, reason: 'Driving planned route segment.', location: null }], totalsMinutes: { off_duty: 0, sleeper_berth: 0, driving: 120, on_duty_not_driving: 0 }, remarks: ['30-minute fuel stop required before driving more than 1,000 miles.'] },
  { date: '2026-09-10', events: [{ kind: 'daily_reset', dutyStatus: 'off_duty', start: '2026-09-10T00:00:00-05:00', end: '2026-09-10T10:00:00-05:00', durationMinutes: 600, required: true, reason: '10 consecutive hours off duty required.', location: null }], totalsMinutes: { off_duty: 600, sleeper_berth: 0, driving: 0, on_duty_not_driving: 0 }, remarks: ['10 consecutive hours off duty required.'] },
]

describe('daily ELD logs', () => {
  it('renders a printable sheet for each calendar day with grid segments and totals', () => {
    render(<DailyLogs logs={logs} locations={locations} />)

    expect(screen.getAllByRole('article', { name: /daily log:/i })).toHaveLength(2)
    expect(screen.getAllByTestId('log-segment')).toHaveLength(2)
    expect(screen.getByText('2:00')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText(/30-minute fuel stop required/i)).toBeInTheDocument()
  })

  it('invokes browser printing from the print control', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    render(<DailyLogs logs={logs} locations={locations} />)

    fireEvent.click(screen.getByRole('button', { name: /print.*save pdf/i }))
    expect(print).toHaveBeenCalledOnce()
  })
})
