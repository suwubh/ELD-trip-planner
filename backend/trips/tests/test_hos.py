from datetime import datetime

import pytest

from trips.contracts import Location, Position, Route, RouteLeg
from trips.hos import HosPlanningError, plan_trip


def _location(name: str) -> Location:
    return Location(name, Position(40.0, -90.0))


def _route(first_minutes: int, second_minutes: int, first_miles: float = 100.0, second_miles: float = 100.0) -> Route:
    current, pickup, dropoff = _location("Current"), _location("Pickup"), _location("Dropoff")
    legs = (
        RouteLeg(current, pickup, first_miles, first_minutes, (current.position, pickup.position)),
        RouteLeg(pickup, dropoff, second_miles, second_minutes, (pickup.position, dropoff.position)),
    )
    return Route(legs, first_miles + second_miles, first_minutes + second_minutes, ())


def _start() -> datetime:
    return datetime.fromisoformat("2026-09-09T08:00:00-05:00")


def _events(plan, kind: str):
    return [event for event in plan.events if event.kind == kind]


def _minutes(event) -> int:
    return int((event.end - event.start).total_seconds() // 60)


def test_short_trip_adds_pickup_and_dropoff_service() -> None:
    plan = plan_trip(_route(120, 180), _start(), 20)

    assert [event.kind for event in plan.events] == ["driving", "pickup_service", "driving", "dropoff_service"]
    assert [_minutes(event) for event in plan.events] == [120, 60, 180, 60]
    assert plan.compliance.cycle_hours_used == 27


def test_pickup_service_can_satisfy_the_driving_break_requirement() -> None:
    plan = plan_trip(_route(450, 120), _start(), 0)

    assert not _events(plan, "required_break")
    assert [_minutes(event) for event in _events(plan, "driving")] == [450, 120]


def test_required_break_is_inserted_before_more_than_eight_driving_hours() -> None:
    plan = plan_trip(_route(60, 540), _start(), 0)

    breaks = _events(plan, "required_break")
    assert len(breaks) == 1
    assert _minutes(breaks[0]) == 30
    assert "8 cumulative driving hours" in breaks[0].reason


def test_fuel_stop_is_inserted_before_exceeding_one_thousand_miles() -> None:
    plan = plan_trip(_route(300, 300, 600, 600), _start(), 0)

    fuel_stops = _events(plan, "fuel_stop")
    assert len(fuel_stops) == 1
    assert _minutes(fuel_stops[0]) == 30
    assert fuel_stops[0].duty_status == "on_duty_not_driving"


def test_eleven_hour_driving_limit_inserts_ten_hour_reset() -> None:
    plan = plan_trip(_route(300, 420), _start(), 0)

    reset = _events(plan, "daily_reset")
    assert len(reset) == 1
    assert _minutes(reset[0]) == 600
    assert [_minutes(event) for event in _events(plan, "driving")] == [300, 360, 60]


def test_fourteen_hour_window_inserts_ten_hour_reset() -> None:
    plan = plan_trip(_route(150, 481, 4_000, 100), _start(), 0)

    reset = _events(plan, "daily_reset")
    assert len(reset) == 1
    assert reset[0].start.isoformat() == "2026-09-09T22:00:00-05:00"


def test_cycle_restart_is_inserted_before_on_duty_work_exceeds_seventy_hours() -> None:
    plan = plan_trip(_route(60, 60), _start(), 69.5)

    restart = _events(plan, "cycle_restart")
    assert len(restart) == 1
    assert _minutes(restart[0]) == 34 * 60
    assert plan.compliance.restart_performed is True
    assert plan.compliance.cycle_hours_used == 3.5


def test_fractional_cycle_hours_are_rounded_up_conservatively() -> None:
    plan = plan_trip(_route(1, 1), _start(), 69.99)

    assert len(_events(plan, "cycle_restart")) == 1


def test_daily_logs_split_an_event_at_local_midnight_and_totals_match() -> None:
    plan = plan_trip(_route(120, 60), datetime.fromisoformat("2026-09-09T23:00:00-05:00"), 0)

    assert [log.date for log in plan.daily_logs] == ["2026-09-09", "2026-09-10"]
    assert plan.daily_logs[0].totals_minutes["driving"] == 60
    assert sum(plan.daily_logs[1].totals_minutes.values()) == sum(_minutes(event) for event in plan.daily_logs[1].events)


def test_hos_engine_rejects_naive_start_time() -> None:
    with pytest.raises(HosPlanningError, match="timezone"):
        plan_trip(_route(10, 10), datetime(2026, 9, 9, 8), 0)
