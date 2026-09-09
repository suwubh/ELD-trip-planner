import { expect, test } from '@playwright/test'

const events = [
  { id: 'event-001', kind: 'driving', dutyStatus: 'driving', start: '2026-09-09T08:00:00-05:00', end: '2026-09-09T16:00:00-05:00', durationMinutes: 480, required: false, reason: 'Driving planned route segment.', location: null },
  { id: 'event-002', kind: 'required_break', dutyStatus: 'off_duty', start: '2026-09-09T16:00:00-05:00', end: '2026-09-09T16:30:00-05:00', durationMinutes: 30, required: true, reason: '30-minute non-driving break required after 8 cumulative driving hours.', location: null },
  { id: 'event-003', kind: 'daily_reset', dutyStatus: 'off_duty', start: '2026-09-10T00:00:00-05:00', end: '2026-09-10T10:00:00-05:00', durationMinutes: 600, required: true, reason: '10 consecutive hours off duty required.', location: null },
]

const plan = {
  trip: {
    startTime: '2026-09-09T08:00:00-05:00',
    locations: {
      current: { label: 'Chicago, IL', address: null, position: { lat: 41.8781, lng: -87.6298 } },
      pickup: { label: 'Indianapolis, IN', address: null, position: { lat: 39.7684, lng: -86.1581 } },
      dropoff: { label: 'Columbus, OH', address: null, position: { lat: 39.9612, lng: -82.9988 } },
    },
  },
  route: { distanceMiles: 359, durationMinutes: 410, geometry: [[41.8781, -87.6298], [40.8, -87.1], [39.9612, -82.9988]] },
  compliance: { isCompliant: true, drivingHoursRemaining: 4.2, dailyWindowHoursRemaining: 6.1, cycleHoursRemaining: 20.5, summary: 'Trip is scheduled within the modeled HOS limits.', nextRequiredStop: null },
  events,
  itinerary: events,
  dailyLogs: [
    { date: '2026-09-09', events: [{ kind: 'driving', dutyStatus: 'driving', start: '2026-09-09T08:00:00-05:00', end: '2026-09-10T00:00:00-05:00', durationMinutes: 960, required: false, reason: 'Driving planned route segment.', location: null }], totalsMinutes: { off_duty: 30, sleeper_berth: 0, driving: 930, on_duty_not_driving: 0 }, remarks: ['30-minute non-driving break required after 8 cumulative driving hours.'] },
    { date: '2026-09-10', events: [{ kind: 'daily_reset', dutyStatus: 'off_duty', start: '2026-09-10T00:00:00-05:00', end: '2026-09-10T10:00:00-05:00', durationMinutes: 600, required: true, reason: '10 consecutive hours off duty required.', location: null }], totalsMinutes: { off_duty: 600, sleeper_berth: 0, driving: 0, on_duty_not_driving: 0 }, remarks: ['10 consecutive hours off duty required.'] },
  ],
}

test('renders a mocked multi-day plan with route, required stops, and printable logs', async ({ page }) => {
  await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printRequested = 'true' } })
  await page.route('**/api/v1/locations/suggest?**', (route) => route.fulfill({ json: { suggestions: [] } }))
  await page.route('**/api/v1/trips/plan', (route) => route.fulfill({ json: plan }))

  await page.goto('/')
  await page.getByLabel('Current location').fill('Chicago, IL')
  await page.getByLabel('Pickup location').fill('Indianapolis, IN')
  await page.getByLabel('Dropoff location').fill('Columbus, OH')
  await page.getByLabel(/Current cycle used/).fill('42.5')
  await page.getByRole('button', { name: /build compliant plan/i }).click()

  await expect(page.getByRole('heading', { name: /route, compliance, and stops/i })).toBeVisible()
  await expect(page.getByLabel('Planned truck route map')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '30-minute non-driving break required' })).toBeVisible()
  await expect(page.getByRole('article', { name: /daily log:/i })).toHaveCount(2)
  await page.getByRole('button', { name: /print.*save pdf/i }).click()
  await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'true')
})
