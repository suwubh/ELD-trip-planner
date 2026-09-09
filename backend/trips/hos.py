"""Pure, deterministic Hours-of-Service scheduling for one planned route."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from math import ceil, floor

from trips.contracts import ComplianceSummary, DailyLog, DutyStatus, Route, TimelineEvent, TripPlan

MINUTES_PER_HOUR = 60
MAX_DRIVING_MINUTES = 11 * MINUTES_PER_HOUR
MAX_DUTY_WINDOW_MINUTES = 14 * MINUTES_PER_HOUR
BREAK_TRIGGER_MINUTES = 8 * MINUTES_PER_HOUR
BREAK_MINUTES = 30
DAILY_RESET_MINUTES = 10 * MINUTES_PER_HOUR
CYCLE_LIMIT_MINUTES = 70 * MINUTES_PER_HOUR
CYCLE_RESTART_MINUTES = 34 * MINUTES_PER_HOUR
SERVICE_MINUTES = 60
FUEL_INTERVAL_MILES = 1_000.0


class HosPlanningError(ValueError):
    """Raised when normalized scheduler inputs cannot produce a deterministic plan."""


@dataclass
class _ScheduleState:
    current_time: datetime
    daily_window_started: datetime
    driving_today: int
    driving_since_break: int
    cycle_used: int
    miles_since_fuel: float
    restart_performed: bool = False

    @property
    def duty_window_used(self) -> int:
        return int((self.current_time - self.daily_window_started).total_seconds() // 60)


def plan_trip(route: Route, start_time: datetime, current_cycle_used_hours: float) -> TripPlan:
    """Schedule a current-to-pickup-to-dropoff route without framework or clock access."""
    _validate_inputs(route, start_time, current_cycle_used_hours)
    state = _ScheduleState(
        current_time=start_time,
        daily_window_started=start_time,
        driving_today=0,
        driving_since_break=0,
        cycle_used=ceil(current_cycle_used_hours * MINUTES_PER_HOUR),
        miles_since_fuel=0.0,
    )
    events: list[TimelineEvent] = []

    for index, leg in enumerate(route.legs):
        _schedule_leg(leg.duration_minutes, leg.distance_miles, leg.destination, state, events)
        if index == 0:
            _schedule_service("pickup_service", "One hour of on-duty time for pickup.", leg.destination, state, events)
        elif index == len(route.legs) - 1:
            _schedule_service("dropoff_service", "One hour of on-duty time for dropoff.", leg.destination, state, events)

    compliance = _build_compliance(state)
    frozen_events = tuple(events)
    return TripPlan(
        route=route,
        events=frozen_events,
        compliance=compliance,
        daily_logs=_build_daily_logs(frozen_events),
    )


def _validate_inputs(route: Route, start_time: datetime, current_cycle_used_hours: float) -> None:
    if start_time.tzinfo is None or start_time.utcoffset() is None:
        raise HosPlanningError("start_time must include a timezone offset")
    if not 0 <= current_cycle_used_hours <= 70:
        raise HosPlanningError("current_cycle_used_hours must be from 0 through 70")
    if len(route.legs) < 2:
        raise HosPlanningError("route must include current-to-pickup and pickup-to-dropoff legs")
    for leg in route.legs:
        if leg.duration_minutes < 0 or leg.distance_miles < 0:
            raise HosPlanningError("route legs cannot have negative distance or duration")


def _schedule_leg(duration_minutes: int, distance_miles: float, destination, state: _ScheduleState, events: list[TimelineEvent]) -> None:
    remaining_minutes = duration_minutes
    remaining_miles = distance_miles

    while remaining_minutes:
        _insert_required_stop_before_driving(state, events)
        available_minutes = _available_driving_minutes(state, remaining_minutes, remaining_miles)
        if available_minutes == 0:
            event_count = len(events)
            _insert_required_stop_before_driving(state, events)
            if len(events) > event_count:
                continue
            _insert_fuel_stop(state, events)
            continue

        distance = remaining_miles * available_minutes / remaining_minutes if remaining_minutes else 0.0
        _append_event(
            events,
            "driving",
            "driving",
            available_minutes,
            False,
            "Driving planned route segment.",
            destination,
            state,
        )
        state.driving_today += available_minutes
        state.driving_since_break += available_minutes
        state.cycle_used += available_minutes
        state.miles_since_fuel += distance
        remaining_minutes -= available_minutes
        remaining_miles -= distance


def _insert_required_stop_before_driving(state: _ScheduleState, events: list[TimelineEvent]) -> None:
    if state.cycle_used >= CYCLE_LIMIT_MINUTES:
        _insert_restart(state, events)
    if state.driving_today >= MAX_DRIVING_MINUTES or state.duty_window_used >= MAX_DUTY_WINDOW_MINUTES:
        _insert_daily_reset(state, events)
    if state.driving_since_break >= BREAK_TRIGGER_MINUTES:
        _insert_break(state, events)
    if state.miles_since_fuel >= FUEL_INTERVAL_MILES - 1e-9:
        _insert_fuel_stop(state, events)


def _available_driving_minutes(state: _ScheduleState, remaining_minutes: int, remaining_miles: float) -> int:
    capacities = [
        remaining_minutes,
        MAX_DRIVING_MINUTES - state.driving_today,
        MAX_DUTY_WINDOW_MINUTES - state.duty_window_used,
        BREAK_TRIGGER_MINUTES - state.driving_since_break,
        CYCLE_LIMIT_MINUTES - state.cycle_used,
    ]
    if remaining_miles > 0:
        miles_until_fuel = FUEL_INTERVAL_MILES - state.miles_since_fuel
        minutes_until_fuel = floor(miles_until_fuel * remaining_minutes / remaining_miles)
        capacities.append(minutes_until_fuel)
    return max(0, min(capacities))


def _schedule_service(kind: str, reason: str, location, state: _ScheduleState, events: list[TimelineEvent]) -> None:
    if state.cycle_used + SERVICE_MINUTES > CYCLE_LIMIT_MINUTES:
        _insert_restart(state, events)
    _append_event(events, kind, "on_duty_not_driving", SERVICE_MINUTES, True, reason, location, state)
    state.cycle_used += SERVICE_MINUTES
    state.driving_since_break = 0


def _insert_break(state: _ScheduleState, events: list[TimelineEvent]) -> None:
    _append_event(
        events,
        "required_break",
        "off_duty",
        BREAK_MINUTES,
        True,
        "30-minute non-driving break required after 8 cumulative driving hours.",
        None,
        state,
    )
    state.driving_since_break = 0


def _insert_fuel_stop(state: _ScheduleState, events: list[TimelineEvent]) -> None:
    if state.cycle_used + BREAK_MINUTES > CYCLE_LIMIT_MINUTES:
        _insert_restart(state, events)
    _append_event(
        events,
        "fuel_stop",
        "on_duty_not_driving",
        BREAK_MINUTES,
        True,
        "30-minute fuel stop required before driving more than 1,000 miles since the last fuel stop.",
        None,
        state,
    )
    state.cycle_used += BREAK_MINUTES
    state.driving_since_break = 0
    state.miles_since_fuel = 0.0


def _insert_daily_reset(state: _ScheduleState, events: list[TimelineEvent]) -> None:
    _append_event(
        events,
        "daily_reset",
        "off_duty",
        DAILY_RESET_MINUTES,
        True,
        "10 consecutive hours off duty required before more driving under daily HOS limits.",
        None,
        state,
    )
    state.daily_window_started = state.current_time
    state.driving_today = 0
    state.driving_since_break = 0


def _insert_restart(state: _ScheduleState, events: list[TimelineEvent]) -> None:
    _append_event(
        events,
        "cycle_restart",
        "off_duty",
        CYCLE_RESTART_MINUTES,
        True,
        "34-hour restart required before on-duty work would exceed the modeled 70-hour cycle.",
        None,
        state,
    )
    state.daily_window_started = state.current_time
    state.driving_today = 0
    state.driving_since_break = 0
    state.cycle_used = 0
    state.restart_performed = True


def _append_event(
    events: list[TimelineEvent],
    kind: str,
    duty_status: DutyStatus,
    duration_minutes: int,
    required: bool,
    reason: str,
    location,
    state: _ScheduleState,
) -> None:
    start = state.current_time
    end = start + timedelta(minutes=duration_minutes)
    events.append(TimelineEvent(kind, duty_status, start, end, required, reason, location))
    state.current_time = end


def _build_compliance(state: _ScheduleState) -> ComplianceSummary:
    driving_remaining = max(0, MAX_DRIVING_MINUTES - state.driving_today)
    window_remaining = max(0, MAX_DUTY_WINDOW_MINUTES - state.duty_window_used)
    cycle_remaining = max(0, CYCLE_LIMIT_MINUTES - state.cycle_used)
    return ComplianceSummary(
        is_compliant=True,
        driving_hours_used=round(state.driving_today / MINUTES_PER_HOUR, 2),
        driving_hours_remaining=round(driving_remaining / MINUTES_PER_HOUR, 2),
        daily_window_hours_remaining=round(window_remaining / MINUTES_PER_HOUR, 2),
        cycle_hours_used=round(state.cycle_used / MINUTES_PER_HOUR, 2),
        cycle_hours_remaining=round(cycle_remaining / MINUTES_PER_HOUR, 2),
        summary="Trip is scheduled within the modeled HOS limits.",
        next_required_stop=None,
        restart_performed=state.restart_performed,
    )


def _build_daily_logs(events: tuple[TimelineEvent, ...]) -> tuple[DailyLog, ...]:
    by_date: dict[str, list[TimelineEvent]] = defaultdict(list)
    for event in events:
        cursor = event.start
        while cursor.date() < event.end.date():
            midnight = datetime.combine(cursor.date() + timedelta(days=1), datetime.min.time(), tzinfo=cursor.tzinfo)
            by_date[cursor.date().isoformat()].append(
                TimelineEvent(event.kind, event.duty_status, cursor, midnight, event.required, event.reason, event.location)
            )
            cursor = midnight
        by_date[cursor.date().isoformat()].append(
            TimelineEvent(event.kind, event.duty_status, cursor, event.end, event.required, event.reason, event.location)
        )

    logs = []
    for date, day_events in sorted(by_date.items()):
        totals: dict[DutyStatus, int] = {
            "off_duty": 0,
            "sleeper_berth": 0,
            "driving": 0,
            "on_duty_not_driving": 0,
        }
        for event in day_events:
            totals[event.duty_status] += _duration_minutes(event)
        remarks = tuple(event.reason for event in day_events if event.required)
        logs.append(DailyLog(date, tuple(day_events), totals, remarks))
    return tuple(logs)


def _duration_minutes(event: TimelineEvent) -> int:
    return int((event.end - event.start).total_seconds() // 60)
