"""Typed domain contracts shared by routing, HOS scheduling, and API views.

These are framework-independent containers. Provider adapters populate them and
serialize them into the documented public response shape.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

DutyStatus = Literal["off_duty", "sleeper_berth", "driving", "on_duty_not_driving"]


@dataclass(frozen=True, slots=True)
class Position:
    lat: float
    lng: float


@dataclass(frozen=True, slots=True)
class Location:
    label: str
    position: Position
    address: str | None = None
    provider_id: str | None = None


@dataclass(frozen=True, slots=True)
class RouteLeg:
    origin: Location
    destination: Location
    distance_miles: float
    duration_minutes: int
    geometry: tuple[Position, ...]


@dataclass(frozen=True, slots=True)
class Route:
    legs: tuple[RouteLeg, ...]
    distance_miles: float
    duration_minutes: int
    geometry: tuple[Position, ...]


@dataclass(frozen=True, slots=True)
class TimelineEvent:
    kind: str
    duty_status: DutyStatus
    start: datetime
    end: datetime
    required: bool
    reason: str
    location: Location | None = None


@dataclass(frozen=True, slots=True)
class ComplianceSummary:
    is_compliant: bool
    driving_hours_used: float
    driving_hours_remaining: float
    daily_window_hours_remaining: float
    cycle_hours_used: float
    cycle_hours_remaining: float
    summary: str
    next_required_stop: TimelineEvent | None = None
    restart_performed: bool = False


@dataclass(frozen=True, slots=True)
class DailyLog:
    date: str
    events: tuple[TimelineEvent, ...]
    totals_minutes: dict[DutyStatus, int]
    remarks: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class TripPlan:
    route: Route
    events: tuple[TimelineEvent, ...]
    compliance: ComplianceSummary
    daily_logs: tuple[DailyLog, ...]
