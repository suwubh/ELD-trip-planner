import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('trip planner form', () => {
  it('renders every required planning input', () => {
    render(<App />)
    expect(screen.getByRole('textbox', { name: /current location/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /pickup location/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /dropoff location/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /current cycle used/i })).toBeInTheDocument()
  })
  it('shows validation messages for an empty submission', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /build compliant plan/i }))
    expect(screen.getAllByRole('alert')).toHaveLength(4)
    expect(screen.getByText(/enter a number from 0 through 70/i)).toBeInTheDocument()
  })
  it('shows suggestions and applies the selected location', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [{ id: '1', label: 'Chicago, IL', address: 'Chicago, Illinois', position: { lat: 1, lng: 2 } }] }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    fireEvent.change(screen.getByRole('textbox', { name: /current location/i }), { target: { value: 'Chi' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.getByRole('button', { name: /chicago, il/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /chicago, il/i }))
    expect(screen.getByRole('textbox', { name: /current location/i })).toHaveValue('Chicago, IL')
    expect(screen.queryByRole('list', { name: /current location suggestions/i })).not.toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
  it('submits a valid plan and presents its compliance summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ route: { distanceMiles: 359, durationMinutes: 410 }, compliance: { isCompliant: true, cycleHoursRemaining: 20.5, summary: 'Trip is scheduled within limits.' }, events: [{ required: true }] }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    fireEvent.change(screen.getByRole('textbox', { name: /current location/i }), { target: { value: 'Chicago, IL' } })
    fireEvent.change(screen.getByRole('textbox', { name: /pickup location/i }), { target: { value: 'Indianapolis, IN' } })
    fireEvent.change(screen.getByRole('textbox', { name: /dropoff location/i }), { target: { value: 'Columbus, OH' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /current cycle used/i }), { target: { value: '42.5' } })
    fireEvent.click(screen.getByRole('button', { name: /build compliant plan/i }))
    await waitFor(() => expect(screen.getByText(/route is within modeled hos limits/i)).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/trips/plan'), expect.objectContaining({ method: 'POST' }))
  })
})
