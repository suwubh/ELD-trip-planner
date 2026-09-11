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

const locationFields: Array<{
  name: LocationFieldName
  label: string
  hint: string
  stepLabel: string
  serviceBadge?: string
}> = [
  {
    name: 'currentLocation',
    label: 'Current location',
    hint: 'Where the driver begins the trip.',
    stepLabel: 'ORIGIN',
  },
  {
    name: 'pickupLocation',
    label: 'Pickup location',
    hint: 'First service stop (1 hour loading).',
    stepLabel: 'PICKUP',
    serviceBadge: '+1h Load',
  },
  {
    name: 'dropoffLocation',
    label: 'Dropoff location',
    hint: 'Final destination (1 hour unloading).',
    stepLabel: 'DROPOFF',
    serviceBadge: '+1h Unload',
  },
]

const demoPresets = [
  {
    id: 'preset-1',
    name: 'Chicago → Columbus',
    badge: '359 mi',
    currentLocation: 'Chicago, IL',
    pickupLocation: 'Indianapolis, IN',
    dropoffLocation: 'Columbus, OH',
    cycleUsed: '20',
  },
  {
    id: 'preset-2',
    name: 'Atlanta → Dallas',
    badge: '820 mi',
    currentLocation: 'Atlanta, GA',
    pickupLocation: 'Nashville, TN',
    dropoffLocation: 'Dallas, TX',
    cycleUsed: '35',
  },
  {
    id: 'preset-3',
    name: 'Los Angeles → New York',
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
  const [activePresetId, setActivePresetId] = useState<string | null>(null)

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
    setActivePresetId(preset.id)
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

  const cycleNum = Number(values.currentCycleUsedHours)
  const isCycleValid = !Number.isNaN(cycleNum) && values.currentCycleUsedHours.trim() !== ''
  const remainingBeforeTrip = isCycleValid ? Math.max(0, 70 - cycleNum) : 70
  const cyclePercentUsed = isCycleValid ? Math.min(100, Math.max(0, (cycleNum / 70) * 100)) : 0

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#planner" aria-label="Linehaul Ledger home">
          <span className="brand-mark" aria-hidden="true">
            LL
          </span>
          <span className="brand-text">
            <strong>Linehaul Ledger</strong>
          </span>
        </a>
        <div className="topbar-status-group">
          <span className="topbar-status">
            <i aria-hidden="true" /> HOS Active
          </span>
        </div>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">FMCSA 70-Hour / 8-Day Rule</p>
        <h1 id="page-title">Commercial Trip Planner</h1>
        <p>
          Calculate truck routes, Hours of Service duty limits, and 24-hour driver log sheets.
        </p>
      </section>

      {/* Presets */}
      <section className="demo-presets-banner" aria-label="Route presets">
        <div className="presets-label">
          <span className="presets-tag">Presets</span>
        </div>
        <div className="presets-list">
          {demoPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`preset-btn ${activePresetId === preset.id ? 'is-selected' : ''}`}
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
              <p className="section-kicker">Input</p>
              <h2>Trip Details</h2>
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
                stepLabel={field.stepLabel}
                serviceBadge={field.serviceBadge}
                value={values[field.name]}
                error={errors[field.name]}
                onChange={(value, position) => updateValue(field.name, value, position)}
              />
            ))}

            <div className="field-group cycle-field-group">
              <div className="cycle-header">
                <label htmlFor="cycle-hours">
                  <span className="field-sequence">4</span>
                  Current cycle used <span aria-hidden="true">*</span>
                </label>
                {isCycleValid && (
                  <span className="cycle-reserve-tag">
                    {remainingBeforeTrip.toFixed(1)}h available
                  </span>
                )}
              </div>

              <div className="cycle-input-wrapper">
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

                <div className="cycle-quick-pills">
                  <button
                    type="button"
                    className="cycle-pill"
                    onClick={() => updateValue('currentCycleUsedHours', '0')}
                  >
                    0h
                  </button>
                  <button
                    type="button"
                    className="cycle-pill"
                    onClick={() => updateValue('currentCycleUsedHours', '20')}
                  >
                    20h
                  </button>
                  <button
                    type="button"
                    className="cycle-pill"
                    onClick={() => updateValue('currentCycleUsedHours', '35')}
                  >
                    35h
                  </button>
                  <button
                    type="button"
                    className="cycle-pill"
                    onClick={() => updateValue('currentCycleUsedHours', '55')}
                  >
                    55h
                  </button>
                </div>
              </div>

              {/* Capacity Visualizer */}
              <div className="cycle-track-container" aria-hidden="true">
                <div className="cycle-track-bar">
                  <div
                    className={`cycle-track-fill ${
                      cyclePercentUsed > 80 ? 'is-critical' : cyclePercentUsed > 50 ? 'is-warning' : 'is-normal'
                    }`}
                    style={{ width: `${cyclePercentUsed}%` }}
                  />
                </div>
                <div className="cycle-track-labels">
                  <span>0h</span>
                  <span>35h</span>
                  <span>70h</span>
                </div>
              </div>

              <p className="field-help" id="cycle-help">
                Prior on-duty hours in current 8-day cycle (0 to 70).
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
            {isSubmitting ? (
              <>Calculating route &amp; HOS…</>
            ) : (
              <>
                Build compliant plan
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>
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
  stepLabel,
  serviceBadge,
  value,
  error,
  onChange,
}: {
  sequence: number
  name: LocationFieldName
  label: string
  hint: string
  stepLabel?: string
  serviceBadge?: string
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

    const timer = setTimeout(async () => {
      setIsLoading(true)
      setRequestError(null)
      try {
        const results = await getLocationSuggestions(query, controller.signal)
        setSuggestions(results)
      } catch (err) {
        if (!controller.signal.aborted) {
          setRequestError(err instanceof ApiError ? err.message : 'Suggestions unavailable.')
          setSuggestions([])
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }, 250)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [value, isSuggestionsOpen])

  function selectSuggestion(suggestion: LocationSuggestion) {
    onChange(suggestion.label, suggestion.position)
    setIsSuggestionsOpen(false)
    setSuggestions([])
  }

  return (
    <div className="field-group">
      <div className="field-label-row">
        <label htmlFor={inputId}>
          <span className="field-sequence">{sequence}</span>
          {label} <span aria-hidden="true">*</span>
        </label>
        {stepLabel && <span className="field-step-tag">{stepLabel}</span>}
        {serviceBadge && <span className="service-badge">{serviceBadge}</span>}
      </div>

      <div className="input-wrapper">
        <input
          id={inputId}
          name={name}
          type="text"
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setIsSuggestionsOpen(true)
          }}
          onFocus={() => {
            if (value.trim().length >= 2) setIsSuggestionsOpen(true)
          }}
          onBlur={() => {
            setTimeout(() => setIsSuggestionsOpen(false), 200)
          }}
          placeholder={`Enter city, state`}
          aria-describedby={`${inputId}-hint`}
          aria-invalid={Boolean(error)}
          autoComplete="off"
        />
        {value.trim() && (
          <button
            type="button"
            className="clear-input-btn"
            onClick={() => onChange('')}
            aria-label={`Clear ${label}`}
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>

      <p className="field-help" id={`${inputId}-hint`}>
        {hint}
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {isSuggestionsOpen && isLoading && (
        <p className="suggestion-state">Searching locations…</p>
      )}
      {isSuggestionsOpen && requestError && <p className="field-error">{requestError}</p>}
      {isSuggestionsOpen && !isLoading && !requestError && value.trim().length >= 2 && suggestions.length === 0 && (
        <p className="suggestion-state">No locations found.</p>
      )}
      {isSuggestionsOpen && suggestions.length > 0 && (
        <ul className="suggestions" id={suggestionsId} aria-label={`${label} suggestions`}>
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button type="button" onClick={() => selectSuggestion(suggestion)}>
                <span className="suggestion-icon">📍</span>
                <div className="suggestion-content">
                  <span className="suggestion-title">{suggestion.label}</span>
                  {suggestion.address && <small className="suggestion-address">{suggestion.address}</small>}
                </div>
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
      <p className="section-kicker">Summary</p>
      <h2>Trip Plan</h2>
      <p>
        Enter trip details to view route instructions, compliance status, and daily log sheets.
      </p>
      <dl className="preview-list">
        <div>
          <dt>Routing</dt>
          <dd>TomTom truck routing</dd>
        </div>
        <div>
          <dt>HOS Rules</dt>
          <dd>11h drive · 14h window · 70h cycle</dd>
        </div>
        <div>
          <dt>Stops</dt>
          <dd>1h pickup &amp; delivery + fuel</dd>
        </div>
        <div>
          <dt>Daily Logs</dt>
          <dd>24-hour RODS sheets</dd>
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
