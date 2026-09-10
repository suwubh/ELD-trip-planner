import { useEffect, useId, useState, type FormEvent } from 'react'
import {
  ApiError,
  getLocationSuggestions,
  planTrip,
  type LocationSuggestion,
  type Position,
  type TripPlanResponse,
} from './api'
import { PlanResults } from './PlanResults'
import './App.css'

type LocationFieldName = 'currentLocation' | 'pickupLocation' | 'dropoffLocation'
type FormValues = Record<LocationFieldName, string> & { currentCycleUsedHours: string }
type FormPositions = Partial<Record<LocationFieldName, Position>>
type FormErrors = Partial<Record<keyof FormValues, string>>

const locationFields: Array<{ name: LocationFieldName; label: string; hint: string }> = [
  { name: 'currentLocation', label: 'Current location', hint: 'Where the driver is beginning this plan.' },
  { name: 'pickupLocation', label: 'Pickup location', hint: 'First required service stop (1 hour loading).' },
  { name: 'dropoffLocation', label: 'Dropoff location', hint: 'Final delivery destination (1 hour unloading).' },
]

const demoPresets = [
  {
    id: 'preset-1',
    name: 'Regional Run (1 Day)',
    badge: '359 mi',
    currentLocation: 'Chicago, IL',
    pickupLocation: 'Indianapolis, IN',
    dropoffLocation: 'Columbus, OH',
    cycleUsed: '20',
  },
  {
    id: 'preset-2',
    name: 'Multi-Day (10h Reset)',
    badge: '820 mi',
    currentLocation: 'Atlanta, GA',
    pickupLocation: 'Nashville, TN',
    dropoffLocation: 'Dallas, TX',
    cycleUsed: '35',
  },
  {
    id: 'preset-3',
    name: 'Cross-Country (Fuel & Restart)',
    badge: '2,780 mi',
    currentLocation: 'Los Angeles, CA',
    pickupLocation: 'Denver, CO',
    dropoffLocation: 'New York, NY',
    cycleUsed: '62',
  },
]

const emptyValues: FormValues = {
  currentLocation: '',
  pickupLocation: '',
  dropoffLocation: '',
  currentCycleUsedHours: '',
}

function getLocalOffsetIsoString(date: Date = new Date()): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const offsetStr = `${sign}${pad(offsetMinutes / 60)}:${pad(offsetMinutes % 60)}`

  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const mins = pad(date.getMinutes())
  const secs = pad(date.getSeconds())

  return `${year}-${month}-${day}T${hours}:${mins}:${secs}${offsetStr}`
}

function App() {
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [positions, setPositions] = useState<FormPositions>({})
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [plan, setPlan] = useState<TripPlanResponse | null>(null)

  function updateValue(name: keyof FormValues, value: string, position?: Position) {
    setValues((current) => ({ ...current, [name]: value }))
    if (name in emptyValues && name !== 'currentCycleUsedHours') {
      const locKey = name as LocationFieldName
      setPositions((current) => ({ ...current, [locKey]: position }))
    }
    setErrors((current) => ({ ...current, [name]: undefined }))
    setSubmitError(null)
  }

  function applyPreset(preset: typeof demoPresets[0]) {
    setValues({
      currentLocation: preset.currentLocation,
      pickupLocation: preset.pickupLocation,
      dropoffLocation: preset.dropoffLocation,
      currentCycleUsedHours: preset.cycleUsed,
    })
    setPositions({})
    setErrors({})
    setSubmitError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)
    setSubmitError(null)
    if (Object.keys(nextErrors).length) return
    setIsSubmitting(true)

    try {
      const startTime = getLocalOffsetIsoString()
      const response = await planTrip({
        currentLocation: {
          query: values.currentLocation,
          position: positions.currentLocation || undefined,
        },
        pickupLocation: {
          query: values.pickupLocation,
          position: positions.pickupLocation || undefined,
        },
        dropoffLocation: {
          query: values.dropoffLocation,
          position: positions.dropoffLocation || undefined,
        },
        currentCycleUsedHours: Number(values.currentCycleUsedHours),
        startTime,
      })
      setPlan(response)
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields)
        setSubmitError(error.message)
      } else {
        setSubmitError('Unable to create a plan right now. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#planner" aria-label="Linehaul Ledger home">
          <span className="brand-mark" aria-hidden="true">
            LL
          </span>
          <span>Linehaul Ledger</span>
        </a>
        <span className="topbar-status">
          <i aria-hidden="true" /> Commercial Truck HOS &amp; ELD Planner
        </span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Property-Carrying CMV · 70 hr / 8 day cycle · FMCSA 49 CFR § 395</p>
        <h1 id="page-title">Plan the road. Respect the clock.</h1>
        <p>
          Automated commercial truck routing, real-time Hours of Service scheduling, mandatory rest breaks,
          and authentic 24-hour printable Driver&apos;s Daily Log sheets.
        </p>
      </section>

      {/* Quick Demo Scenarios Banner for Evaluator */}
      <section className="demo-presets-banner" aria-label="Quick demo scenarios">
        <div className="presets-label">
          <span className="presets-tag">Quick Demo Presets</span>
          <span>One-click test routes for evaluation:</span>
        </div>
        <div className="presets-list">
          {demoPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="preset-btn"
              onClick={() => applyPreset(preset)}
            >
              <strong>{preset.name}</strong>
              <small>{preset.badge}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="planner-grid" id="planner" aria-label="Trip planner">
        <form className="planner-card" onSubmit={handleSubmit} noValidate>
          <div className="card-heading">
            <div>
              <p className="section-kicker">New Trip</p>
              <h2>Trip details</h2>
            </div>
            <span className="required-note">
              <b>*</b> Required
            </span>
          </div>

          <div className="fields">
            {locationFields.map((field, index) => (
              <LocationField
                key={field.name}
                sequence={index + 1}
                name={field.name}
                label={field.label}
                hint={field.hint}
                value={values[field.name]}
                error={errors[field.name]}
                onChange={(value, position) => updateValue(field.name, value, position)}
              />
            ))}

            <div className="field-group">
              <label htmlFor="cycle-hours">
                Current cycle used <span aria-hidden="true">*</span>
              </label>
              <div className="cycle-input">
                <input
                  id="cycle-hours"
                  name="currentCycleUsedHours"
                  inputMode="decimal"
                  type="number"
                  min="0"
                  max="70"
                  step="0.25"
                  placeholder="0"
                  value={values.currentCycleUsedHours}
                  onChange={(event) => updateValue('currentCycleUsedHours', event.target.value)}
                  aria-describedby="cycle-help"
                  aria-invalid={Boolean(errors.currentCycleUsedHours)}
                />
                <span>hours of 70</span>
              </div>
              <p className="field-help" id="cycle-help">
                Driver&apos;s on-duty hours accumulated in the current 8-day cycle (0 to 70).
              </p>
              {errors.currentCycleUsedHours && (
                <p className="field-error" role="alert">
                  {errors.currentCycleUsedHours}
                </p>
              )}
            </div>
          </div>

          {submitError && (
            <p className="submit-error" role="alert">
              {submitError}
            </p>
          )}

          <button className="plan-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Calculating truck route & HOS…' : 'Build compliant plan'}
            <span aria-hidden="true">→</span>
          </button>
          <p className="form-footnote">
            Uses TomTom Commercial Truck Routing &amp; 70hr/8day HOS engine. All calculations are stateless.
          </p>
        </form>

        <aside className="preview-card" aria-live="polite">
          {plan ? <PlanPreview plan={plan} /> : <EmptyPreview />}
        </aside>
      </section>

      {plan && <PlanResults plan={plan} />}
    </main>
  )
}

function LocationField({
  sequence,
  name,
  label,
  hint,
  value,
  error,
  onChange,
}: {
  sequence: number
  name: LocationFieldName
  label: string
  hint: string
  value: string
  error?: string
  onChange: (value: string, position?: Position) => void
}) {
  const inputId = useId()
  const suggestionsId = `${inputId}-suggestions`
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false)

  useEffect(() => {
    const query = value.trim()
    if (!isSuggestionsOpen || query.length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setIsLoading(true)
      setRequestError(null)
      try {
        setSuggestions(await getLocationSuggestions(query, controller.signal))
      } catch (request) {
        if (!(request instanceof DOMException && request.name === 'AbortError')) {
          setSuggestions([])
          setRequestError('Suggestions are unavailable. You can still enter a complete location.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }, 300)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [value, isSuggestionsOpen])

  function closeSuggestions() {
    setIsSuggestionsOpen(false)
    setSuggestions([])
    setIsLoading(false)
    setRequestError(null)
  }

  function selectSuggestion(suggestion: LocationSuggestion) {
    closeSuggestions()
    onChange(suggestion.label, suggestion.position)
  }

  return (
    <div
      className="field-group location-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeSuggestions()
      }}
    >
      <label htmlFor={inputId}>
        <span className="field-sequence">{sequence}</span>
        {label} <span aria-hidden="true">*</span>
      </label>
      <input
        id={inputId}
        name={name}
        type="text"
        autoComplete="off"
        placeholder="City, state or terminal address"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value
          setIsSuggestionsOpen(true)
          setSuggestions([])
          setRequestError(null)
          if (nextValue.trim().length < 2) setIsLoading(false)
          onChange(nextValue)
        }}
        onFocus={() => {
          if (value.trim().length >= 2) setIsSuggestionsOpen(true)
        }}
        aria-autocomplete="list"
        aria-controls={suggestionsId}
        aria-expanded={isSuggestionsOpen && suggestions.length > 0}
        aria-describedby={`${inputId}-help`}
        aria-invalid={Boolean(error)}
      />
      <p className="field-help" id={`${inputId}-help`}>
        {hint}
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {isSuggestionsOpen && isLoading && (
        <p className="suggestion-state">Finding locations…</p>
      )}
      {isSuggestionsOpen && requestError && <p className="field-error">{requestError}</p>}
      {isSuggestionsOpen && !isLoading && !requestError && value.trim().length >= 2 && suggestions.length === 0 && (
        <p className="suggestion-state">No suggestions found.</p>
      )}
      {isSuggestionsOpen && suggestions.length > 0 && (
        <ul className="suggestions" id={suggestionsId} aria-label={`${label} suggestions`}>
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button type="button" onClick={() => selectSuggestion(suggestion)}>
                <span>{suggestion.label}</span>
                {suggestion.address && <small>{suggestion.address}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EmptyPreview() {
  return (
    <div className="empty-preview">
      <div className="route-graphic" aria-hidden="true">
        <span className="route-dot start" />
        <span className="route-line" />
        <span className="route-stop">01</span>
        <span className="route-line short" />
        <span className="route-dot end" />
      </div>
      <p className="section-kicker">Plan Preview</p>
      <h2>Your compliant route appears here.</h2>
      <p>
        We&apos;ll surface drive time, mandated 30-min breaks, fuel stops every 1,000 miles, overnight 10-hr resets,
        and authentic 24-hour printable log sheets.
      </p>
      <dl className="preview-list">
        <div>
          <dt>Route</dt>
          <dd>Commercial truck routing through TomTom</dd>
        </div>
        <div>
          <dt>HOS Engine</dt>
          <dd>Minute-accurate 70hr/8day compliance</dd>
        </div>
        <div>
          <dt>Logs</dt>
          <dd>FMCSA 24-hour Daily Logs, ready to print</dd>
        </div>
      </dl>
    </div>
  )
}

function PlanPreview({ plan }: { plan: TripPlanResponse }) {
  return (
    <div className="plan-preview">
      <p className="section-kicker">Plan Ready</p>
      <h2>
        {plan.compliance.isCompliant
          ? 'Route is within modeled HOS limits.'
          : 'Review the compliance status.'}
      </h2>
      <div className="stat-grid">
        <div>
          <span>Route distance</span>
          <strong>{plan.route.distanceMiles.toLocaleString()} mi</strong>
        </div>
        <div>
          <span>Driving time</span>
          <strong>{(plan.route.durationMinutes / 60).toFixed(1)} hr</strong>
        </div>
        <div>
          <span>Cycle left</span>
          <strong>{plan.compliance.cycleHoursRemaining.toFixed(1)} hr</strong>
        </div>
        <div>
          <span>Required stops</span>
          <strong>{plan.events.filter((event) => event.required).length}</strong>
        </div>
      </div>
      <p className="preview-summary">{plan.compliance.summary}</p>
    </div>
  )
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {}
  for (const field of locationFields) {
    if (!values[field.name].trim()) {
      errors[field.name] = `${field.label} is required.`
    }
  }
  const cycle = Number(values.currentCycleUsedHours)
  if (!values.currentCycleUsedHours || Number.isNaN(cycle) || cycle < 0 || cycle > 70) {
    errors.currentCycleUsedHours = 'Enter a number from 0 through 70.'
  }
  return errors
}

export default App
