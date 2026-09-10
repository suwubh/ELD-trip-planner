export type Position = { lat: number; lng: number }
export type PlannedLocation = { label: string; address: string | null; position: Position }
export type LocationSuggestion = { id: string; label: string; address: string | null; position: Position }
export type PlanEvent = {
  id?: string
  kind: string
  dutyStatus: 'off_duty' | 'sleeper_berth' | 'driving' | 'on_duty_not_driving'
  start: string
  end: string
  durationMinutes: number
  distanceMiles?: number
  required: boolean
  reason: string
  location: PlannedLocation | null
}
export type RouteResponse = { distanceMiles: number; durationMinutes: number; geometry: Array<[number, number]> }
export type DailyLogRecap = {
  onDutyTodayHours: number
  totalHoursLast7Days: number
  availableTomorrowHours: number
  totalHoursLast8Days: number
}
export type DailyLog = {
  date: string
  dayNumber?: number
  totalMilesDrivingToday?: number
  startLocation?: string
  endLocation?: string
  events: PlanEvent[]
  totalsMinutes: Record<PlanEvent['dutyStatus'], number>
  remarks: string[]
  recap?: DailyLogRecap
}
export type ComplianceInfo = {
  isCompliant: boolean
  drivingHoursUsed?: number
  drivingHoursRemaining?: number
  dailyWindowHoursRemaining?: number
  cycleHoursUsed?: number
  cycleHoursRemaining: number
  summary: string
  nextRequiredStop?: PlanEvent | null
  restartPerformed?: boolean
}
export type TripPlanResponse = {
  trip?: { startTime: string; locations: { current: PlannedLocation; pickup: PlannedLocation; dropoff: PlannedLocation } }
  route: RouteResponse
  compliance: ComplianceInfo
  events: PlanEvent[]
  itinerary?: PlanEvent[]
  dailyLogs?: DailyLog[]
}
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
