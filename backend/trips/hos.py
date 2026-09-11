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
    start_time = start_time.replace(second=0, microsecond=0)
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

    # Identify the next required HOS stop (fuel, break, reset, restart) after departure
    next_required = None
    for event in events:
        if (event.required or event.kind == "cycle_restart") and event.kind not in ("pickup_service", "dropoff_service"):
            next_required = event
            break

    compliance = _build_compliance(state, next_required)
    frozen_events = tuple(events)
    return TripPlan(
        route=route,
        events=frozen_events,
        compliance=compliance,
        daily_logs=_build_daily_logs(frozen_events, start_time, route, current_cycle_used_hours),
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
            distance_miles=round(distance, 1),
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
        False,
        "Optional 34-hour cycle restart taken to reset 70-hour cycle before further driving.",
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
    distance_miles: float = 0.0,
) -> None:
    start = state.current_time
    end = start + timedelta(minutes=duration_minutes)
    events.append(TimelineEvent(kind, duty_status, start, end, required, reason, location, distance_miles))
    state.current_time = end


def _build_compliance(state: _ScheduleState, next_required: TimelineEvent | None = None) -> ComplianceSummary:
    driving_remaining = max(0, MAX_DRIVING_MINUTES - state.driving_today)
    window_remaining = max(0, MAX_DUTY_WINDOW_MINUTES - state.duty_window_used)
    cycle_remaining = max(0, CYCLE_LIMIT_MINUTES - state.cycle_used)
    summary_text = "Trip is scheduled within modeled HOS limits."
    if next_required:
        summary_text = f"Trip scheduled within HOS limits. Next stop: {next_required.reason}"
    return ComplianceSummary(
        is_compliant=True,
        driving_hours_used=round(state.driving_today / MINUTES_PER_HOUR, 2),
        driving_hours_remaining=round(driving_remaining / MINUTES_PER_HOUR, 2),
        daily_window_hours_remaining=round(window_remaining / MINUTES_PER_HOUR, 2),
        cycle_hours_used=round(state.cycle_used / MINUTES_PER_HOUR, 2),
        cycle_hours_remaining=round(cycle_remaining / MINUTES_PER_HOUR, 2),
        summary=summary_text,
        next_required_stop=next_required,
        restart_performed=state.restart_performed,
    )


def _build_daily_logs(
    events: tuple[TimelineEvent, ...],
    start_time: datetime,
    route: Route,
    initial_cycle_used: float = 0.0,
) -> tuple[DailyLog, ...]:
    if not events:
        return ()

    by_date: dict[str, list[TimelineEvent]] = defaultdict(list)
    for event in events:
        cursor = event.start
        total_duration = _duration_minutes(event)
        while cursor.date() < event.end.date():
            midnight = datetime.combine(cursor.date() + timedelta(days=1), datetime.min.time(), tzinfo=cursor.tzinfo)
            part_duration = int((midnight - cursor).total_seconds() // 60)
            fraction = (part_duration / total_duration) if total_duration > 0 else 1.0
            by_date[cursor.date().isoformat()].append(
                TimelineEvent(
                    event.kind,
                    event.duty_status,
                    cursor,
                    midnight,
                    event.required,
                    event.reason,
                    event.location,
                    round(event.distance_miles * fraction, 1),
                )
            )
            cursor = midnight
        part_duration = int((event.end - cursor).total_seconds() // 60)
        fraction = (part_duration / total_duration) if total_duration > 0 else 1.0
        by_date[cursor.date().isoformat()].append(
            TimelineEvent(
                event.kind,
                event.duty_status,
                cursor,
                event.end,
                event.required,
                event.reason,
                event.location,
                round(event.distance_miles * fraction, 1),
            )
        )

    restarts = [ev for ev in events if ev.kind == "cycle_restart"]
    logs = []
    sorted_dates = sorted(by_date.keys())
    running_cycle = initial_cycle_used
    origin_loc = route.legs[0].origin if route.legs else None
    dest_loc = route.legs[-1].destination if route.legs else None

    for day_index, date_str in enumerate(sorted_dates, start=1):
        day_events = by_date[date_str]
        day_date = datetime.fromisoformat(date_str).date()
        tz = day_events[0].start.tzinfo

        day_start = datetime.combine(day_date, datetime.min.time(), tzinfo=tz)
        day_end = datetime.combine(day_date + timedelta(days=1), datetime.min.time(), tzinfo=tz)

        # Pad initial off-duty from midnight to the first event if there is a gap
        if day_events[0].start > day_start:
            first_loc = day_events[0].location or origin_loc
            day_events.insert(
                0,
                TimelineEvent(
                    kind="off_duty",
                    duty_status="off_duty",
                    start=day_start,
                    end=day_events[0].start,
                    required=False,
                    reason="Off duty prior to shift departure.",
                    location=first_loc,
                    distance_miles=0.0,
                ),
            )

        # Fill any intermediate gaps between events with off_duty
        padded: list[TimelineEvent] = []
        for i, ev in enumerate(day_events):
            padded.append(ev)
            if i < len(day_events) - 1:
                next_ev = day_events[i + 1]
                if ev.end < next_ev.start:
                    gap_loc = ev.location or next_ev.location or origin_loc
                    padded.append(
                        TimelineEvent(
                            kind="off_duty",
                            duty_status="off_duty",
                            start=ev.end,
                            end=next_ev.start,
                            required=False,
                            reason="Off duty between scheduled assignments.",
                            location=gap_loc,
                            distance_miles=0.0,
                        )
                    )
        day_events = padded

        # Pad final off-duty from the last event to midnight
        if day_events[-1].end < day_end:
            last_loc = day_events[-1].location or dest_loc
            day_events.append(
                TimelineEvent(
                    kind="off_duty",
                    duty_status="off_duty",
                    start=day_events[-1].end,
                    end=day_end,
                    required=False,
                    reason="Off duty after shift completion.",
                    location=last_loc,
                    distance_miles=0.0,
                )
            )

        totals: dict[DutyStatus, int] = {
            "off_duty": 0,
            "sleeper_berth": 0,
            "driving": 0,
            "on_duty_not_driving": 0,
        }
        for ev in day_events:
            totals[ev.duty_status] += _duration_minutes(ev)

        miles_today = round(sum(ev.distance_miles for ev in day_events if ev.duty_status == "driving"), 1)

        # Build detailed remarks with time and location
        remarks_list = []
        for ev in day_events:
            if ev.kind != "off_duty" or ev.required or ev.kind == "cycle_restart":
                loc_str = ev.location.label if ev.location else "En route"
                time_str = ev.start.strftime("%H:%M")
                remarks_list.append(f"{time_str} - {loc_str}: {ev.reason}")
        if not remarks_list:
            remarks_list.append("Off duty entire calendar day.")

        # 70-hour / 8-day rolling recap calculation (FMCSA 49 CFR § 395.3)
        on_duty_today_hours = round((totals["driving"] + totals["on_duty_not_driving"]) / MINUTES_PER_HOUR, 2)

        finishing_restart = next((r for r in restarts if day_start <= r.end <= day_end), None)
        ongoing_restart = next((r for r in restarts if r.start < day_end and r.end > day_end), None)

        if finishing_restart is not None:
            # 34 consecutive hours off duty completed; cycle resets upon completion.
            post_restart_mins = sum(
                _duration_minutes(ev)
                for ev in day_events
                if ev.start >= finishing_restart.end and ev.duty_status in ("driving", "on_duty_not_driving")
            )
            running_cycle = round(post_restart_mins / MINUTES_PER_HOUR, 2)
            if ongoing_restart is not None:
                available_tomorrow = 0.0
            else:
                available_tomorrow = round(max(0.0, 70.0 - running_cycle), 2)
        elif ongoing_restart is not None:
            # Restart is in progress across midnight; cycle has not reset and driver cannot drive tomorrow.
            running_cycle = round(running_cycle + on_duty_today_hours, 2)
            available_tomorrow = 0.0
        else:
            running_cycle = round(running_cycle + on_duty_today_hours, 2)
            available_tomorrow = round(max(0.0, 70.0 - running_cycle), 2)

        recap = {
            "onDutyTodayHours": on_duty_today_hours,
            "totalHoursLast7Days": running_cycle,
            "availableTomorrowHours": available_tomorrow,
            "totalHoursLast8Days": running_cycle,
        }

        start_label = origin_loc.label if origin_loc else ""
        end_label = dest_loc.label if dest_loc else ""
        for ev in day_events:
            if ev.location:
                start_label = ev.location.label
                break
        for ev in reversed(day_events):
            if ev.location:
                end_label = ev.location.label
                break

        logs.append(
            DailyLog(
                date=date_str,
                events=tuple(day_events),
                totals_minutes=totals,
                remarks=tuple(remarks_list),
                total_miles_driving_today=miles_today,
                day_number=day_index,
                start_location=start_label,
                end_location=end_label,
                recap=recap,
            )
        )

    return tuple(logs)


def _duration_minutes(event: TimelineEvent) -> int:
    return int((event.end - event.start).total_seconds() // 60)
