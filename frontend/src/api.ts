export type LocationSuggestion = { id: string; label: string; address: string | null; position: { lat: number; lng: number } }
export type TripPlanResponse = { route: { distanceMiles: number; durationMinutes: number }; compliance: { isCompliant: boolean; cycleHoursRemaining: number; summary: string }; events: Array<{ required: boolean }> }
type ApiErrorBody = { error?: { message?: string; fields?: Record<string, string[]> } }

export class ApiError extends Error {
  fields: Record<string, string>
  constructor(message: string, fields: Record<string, string> = {}) { super(message); this.fields = fields }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

export async function getLocationSuggestions(query: string, signal: AbortSignal): Promise<LocationSuggestion[]> {
  const response = await fetch(`${apiBaseUrl}/api/v1/locations/suggest?q=${encodeURIComponent(query)}`, { signal })
  if (!response.ok) throw new ApiError('Location suggestions are unavailable.')
  const body = await response.json() as { suggestions?: LocationSuggestion[] }
  return body.suggestions || []
}

export async function planTrip(payload: object): Promise<TripPlanResponse> {
  const response = await fetch(`${apiBaseUrl}/api/v1/trips/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await response.json() as TripPlanResponse & ApiErrorBody
  if (!response.ok) {
    const fields = Object.fromEntries(Object.entries(body.error?.fields || {}).map(([name, messages]) => [name, messages[0] || 'Invalid value.']))
    throw new ApiError(body.error?.message || 'Unable to create a plan.', fields)
  }
  return body
}
