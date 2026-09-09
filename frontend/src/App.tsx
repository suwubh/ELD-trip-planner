import { useEffect, useId, useState, type FormEvent } from 'react'
import { ApiError, getLocationSuggestions, planTrip, type LocationSuggestion, type TripPlanResponse } from './api'
import { PlanResults } from './PlanResults'
import './App.css'

type LocationFieldName = 'currentLocation' | 'pickupLocation' | 'dropoffLocation'
type FormValues = Record<LocationFieldName, string> & { currentCycleUsedHours: string }
type FormErrors = Partial<Record<keyof FormValues, string>>

const locationFields: Array<{ name: LocationFieldName; label: string; hint: string }> = [
  { name: 'currentLocation', label: 'Current location', hint: 'Where the driver is beginning this plan.' },
  { name: 'pickupLocation', label: 'Pickup location', hint: 'First required service stop.' },
  { name: 'dropoffLocation', label: 'Dropoff location', hint: 'Final delivery location.' },
]

const emptyValues: FormValues = { currentLocation: '', pickupLocation: '', dropoffLocation: '', currentCycleUsedHours: '' }

function App() {
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [plan, setPlan] = useState<TripPlanResponse | null>(null)

  function updateValue(name: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
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
      setPlan(await planTrip({
        currentLocation: { query: values.currentLocation }, pickupLocation: { query: values.pickupLocation },
        dropoffLocation: { query: values.dropoffLocation }, currentCycleUsedHours: Number(values.currentCycleUsedHours),
        startTime: new Date().toISOString(),
      }))
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields)
        setSubmitError(error.message)
      } else setSubmitError('Unable to create a plan right now. Please try again.')
    } finally { setIsSubmitting(false) }
  }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#planner" aria-label="Linehaul Ledger home"><span className="brand-mark" aria-hidden="true">LL</span><span>Linehaul Ledger</span></a><span className="topbar-status"><i aria-hidden="true" /> HOS trip planner</span></header>
    <section className="intro" aria-labelledby="page-title"><p className="eyebrow">Property-carrying · 70 hr / 8 day cycle</p><h1 id="page-title">Plan the road. Respect the clock.</h1><p>Build a compliant route through pickup and delivery, with HOS stops and daily ELD logs calculated for the trip.</p></section>
    <section className="planner-grid" id="planner" aria-label="Trip planner">
      <form className="planner-card" onSubmit={handleSubmit} noValidate>
        <div className="card-heading"><div><p className="section-kicker">New trip</p><h2>Trip details</h2></div><span className="required-note"><b>*</b> Required</span></div>
        <div className="fields">
          {locationFields.map((field, index) => <LocationField key={field.name} sequence={index + 1} name={field.name} label={field.label} hint={field.hint} value={values[field.name]} error={errors[field.name]} onChange={(value) => updateValue(field.name, value)} />)}
          <div className="field-group"><label htmlFor="cycle-hours">Current cycle used <span aria-hidden="true">*</span></label><div className="cycle-input"><input id="cycle-hours" name="currentCycleUsedHours" inputMode="decimal" type="number" min="0" max="70" step="0.25" placeholder="0" value={values.currentCycleUsedHours} onChange={(event) => updateValue('currentCycleUsedHours', event.target.value)} aria-describedby="cycle-help" aria-invalid={Boolean(errors.currentCycleUsedHours)} /><span>hours of 70</span></div><p className="field-help" id="cycle-help">Enter the driver’s on-duty hours already used in the current 8-day cycle.</p>{errors.currentCycleUsedHours && <p className="field-error" role="alert">{errors.currentCycleUsedHours}</p>}</div>
        </div>
        {submitError && <p className="submit-error" role="alert">{submitError}</p>}
        <button className="plan-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Building plan…' : 'Build compliant plan'}<span aria-hidden="true">→</span></button><p className="form-footnote">Your plan starts at the current browser time. It is not stored.</p>
      </form>
      <aside className="preview-card" aria-live="polite">{plan ? <PlanPreview plan={plan} /> : <EmptyPreview />}</aside>
    </section>
    {plan && <PlanResults plan={plan} />}
  </main>
}

function LocationField({ sequence, name, label, hint, value, error, onChange }: { sequence: number; name: LocationFieldName; label: string; hint: string; value: string; error?: string; onChange: (value: string) => void }) {
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
      setIsLoading(true); setRequestError(null)
      try { setSuggestions(await getLocationSuggestions(query, controller.signal)) }
      catch (request) {
        if (!(request instanceof DOMException && request.name === 'AbortError')) { setSuggestions([]); setRequestError('Suggestions are unavailable. You can still enter a complete location.') }
      } finally { if (!controller.signal.aborted) setIsLoading(false) }
    }, 300)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [value, isSuggestionsOpen])
  function closeSuggestions() {
    setIsSuggestionsOpen(false)
    setSuggestions([])
    setIsLoading(false)
    setRequestError(null)
  }
  function selectSuggestion(suggestion: LocationSuggestion) {
    closeSuggestions()
    onChange(suggestion.label)
  }
  return <div className="field-group location-field" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) closeSuggestions() }}>
    <label htmlFor={inputId}><span className="field-sequence">{sequence}</span>{label} <span aria-hidden="true">*</span></label>
    <input id={inputId} name={name} type="text" autoComplete="off" placeholder="City, state or address" value={value} onChange={(event) => { const nextValue = event.target.value; setIsSuggestionsOpen(true); setSuggestions([]); setRequestError(null); if (nextValue.trim().length < 2) setIsLoading(false); onChange(nextValue) }} onFocus={() => { if (value.trim().length >= 2) setIsSuggestionsOpen(true) }} aria-autocomplete="list" aria-controls={suggestionsId} aria-expanded={isSuggestionsOpen && suggestions.length > 0} aria-describedby={`${inputId}-help`} aria-invalid={Boolean(error)} />
    <p className="field-help" id={`${inputId}-help`}>{hint}</p>{error && <p className="field-error" role="alert">{error}</p>}{isSuggestionsOpen && isLoading && <p className="suggestion-state">Finding locations…</p>}{isSuggestionsOpen && requestError && <p className="field-error">{requestError}</p>}
    {isSuggestionsOpen && !isLoading && !requestError && value.trim().length >= 2 && suggestions.length === 0 && <p className="suggestion-state">No suggestions found.</p>}
    {isSuggestionsOpen && suggestions.length > 0 && <ul className="suggestions" id={suggestionsId} aria-label={`${label} suggestions`}>{suggestions.map((suggestion) => <li key={suggestion.id}><button type="button" onClick={() => selectSuggestion(suggestion)}><span>{suggestion.label}</span>{suggestion.address && <small>{suggestion.address}</small>}</button></li>)}</ul>}
  </div>
}

function EmptyPreview() { return <div className="empty-preview"><div className="route-graphic" aria-hidden="true"><span className="route-dot start" /><span className="route-line" /><span className="route-stop">01</span><span className="route-line short" /><span className="route-dot end" /></div><p className="section-kicker">Plan preview</p><h2>Your compliant route appears here.</h2><p>We’ll surface drive time, mandated breaks, fuel stops, remaining capacity, and printable log sheets.</p><dl className="preview-list"><div><dt>Route</dt><dd>HGV routing through ORS</dd></div><div><dt>Schedule</dt><dd>Minute-level HOS timeline</dd></div><div><dt>Logs</dt><dd>Daily ELD sheets, ready to print</dd></div></dl></div> }

function PlanPreview({ plan }: { plan: TripPlanResponse }) { return <div className="plan-preview"><p className="section-kicker">Plan ready</p><h2>{plan.compliance.isCompliant ? 'Route is within modeled HOS limits.' : 'Review the compliance status.'}</h2><div className="stat-grid"><div><span>Route distance</span><strong>{plan.route.distanceMiles.toLocaleString()} mi</strong></div><div><span>Driving time</span><strong>{(plan.route.durationMinutes / 60).toFixed(1)} hr</strong></div><div><span>Cycle left</span><strong>{plan.compliance.cycleHoursRemaining.toFixed(1)} hr</strong></div><div><span>Required stops</span><strong>{plan.events.filter((event) => event.required).length}</strong></div></div><p className="preview-summary">{plan.compliance.summary}</p></div> }

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {}
  for (const field of locationFields) if (!values[field.name].trim()) errors[field.name] = `${field.label} is required.`
  const cycle = Number(values.currentCycleUsedHours)
  if (!values.currentCycleUsedHours || Number.isNaN(cycle) || cycle < 0 || cycle > 70) errors.currentCycleUsedHours = 'Enter a number from 0 through 70.'
  return errors
}

export default App
