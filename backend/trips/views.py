"""HTTP entry points for location suggestions and stateless trip planning."""

from datetime import datetime

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from trips.contracts import ComplianceSummary, DailyLog, Location, Position, Route, RouteLeg, TimelineEvent, TripPlan
from trips.hos import HosPlanningError, plan_trip
from trips.serializers import TripPlanRequestSerializer
from trips.tomtom_client import TomTomClient, TomTomClientError, TomTomNotFoundError, TomTomTimeoutError


class HealthView(APIView):
    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request):
        return Response({"status": "ok", "service": "linehaul-ledger-api"})


class LocationSuggestView(APIView):
    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response(
                {"error": {"code": "validation_error", "message": "Enter at least 2 characters."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            limit = min(max(int(request.query_params.get("limit", 5)), 1), 10)
        except ValueError:
            return Response(
                {"error": {"code": "validation_error", "message": "Limit must be a number from 1 through 10."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            suggestions = TomTomClient().suggest(query, limit)
        except TomTomClientError:
            return Response(
                {"error": {"code": "locations_unavailable", "message": "Location suggestions are temporarily unavailable."}},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"suggestions": [suggestion.as_dict() for suggestion in suggestions]})


class TripPlanView(APIView):
    """Resolve locations, route the truck, and return a client-ready HOS plan."""

    def post(self, request):
        serializer = TripPlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        client = TomTomClient()
        try:
            current = client.geocode(data["currentLocation"]["query"])
            pickup = client.geocode(data["pickupLocation"]["query"])
            dropoff = client.geocode(data["dropoffLocation"]["query"])
            route = client.truck_route(current, pickup, dropoff)
            plan = plan_trip(route, data["startTime"], data["currentCycleUsedHours"])
        except TomTomNotFoundError:
            return Response(
                {
                    "error": {
                        "code": "location_not_found",
                        "message": "One or more locations could not be resolved. Please choose a more specific location.",
                    }
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except TomTomTimeoutError:
            return Response(
                {
                    "error": {
                        "code": "routing_timeout",
                        "message": "Truck routing timed out. Please try again.",
                    }
                },
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except TomTomClientError:
            return Response(
                {
                    "error": {
                        "code": "routing_unavailable",
                        "message": "Truck routing is temporarily unavailable. Please try again.",
                    }
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except HosPlanningError:
            return Response(
                {
                    "error": {
                        "code": "validation_error",
                        "message": "The trip inputs cannot be scheduled.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            _trip_plan_response(plan, current, pickup, dropoff, data["startTime"]),
            status=status.HTTP_200_OK,
        )


def _trip_plan_response(
    plan: TripPlan,
    current: Location,
    pickup: Location,
    dropoff: Location,
    start_time: datetime,
) -> dict:
    event_ids = {id(event): f"event-{index:03d}" for index, event in enumerate(plan.events, start=1)}
    return {
        "trip": {
            "startTime": start_time.isoformat(),
            "locations": {
                "current": _location_payload(current),
                "pickup": _location_payload(pickup),
                "dropoff": _location_payload(dropoff),
            },
        },
        "route": _route_payload(plan.route),
        "compliance": _compliance_payload(plan.compliance, event_ids),
        "events": [_event_payload(event, event_ids[id(event)]) for event in plan.events],
        "itinerary": [_event_payload(event, event_ids[id(event)]) for event in plan.events],
        "dailyLogs": [_daily_log_payload(log) for log in plan.daily_logs],
    }


def _position_payload(position: Position) -> dict[str, float]:
    return {"lat": position.lat, "lng": position.lng}


def _location_payload(location: Location) -> dict:
    return {
        "label": location.label,
        "address": location.address,
        "position": _position_payload(location.position),
    }


def _route_payload(route: Route) -> dict:
    return {
        "distanceMiles": round(route.distance_miles, 2),
        "durationMinutes": route.duration_minutes,
        "geometry": [[point.lat, point.lng] for point in route.geometry],
        "legs": [_route_leg_payload(leg) for leg in route.legs],
    }


def _route_leg_payload(leg: RouteLeg) -> dict:
    return {
        "origin": _location_payload(leg.origin),
        "destination": _location_payload(leg.destination),
        "distanceMiles": round(leg.distance_miles, 2),
        "durationMinutes": leg.duration_minutes,
        "geometry": [[point.lat, point.lng] for point in leg.geometry],
    }


def _event_payload(event: TimelineEvent, event_id: str | None = None) -> dict:
    payload = {
        "kind": event.kind,
        "dutyStatus": event.duty_status,
        "start": event.start.isoformat(),
        "end": event.end.isoformat(),
        "durationMinutes": _event_duration_minutes(event),
        "required": event.required,
        "reason": event.reason,
        "location": _location_payload(event.location) if event.location else None,
    }
    if event_id is not None:
        payload["id"] = event_id
    return payload


def _event_duration_minutes(event: TimelineEvent) -> int:
    return int((event.end - event.start).total_seconds() // 60)


def _compliance_payload(summary: ComplianceSummary, event_ids: dict[int, str]) -> dict:
    return {
        "isCompliant": summary.is_compliant,
        "drivingHoursUsed": summary.driving_hours_used,
        "drivingHoursRemaining": summary.driving_hours_remaining,
        "dailyWindowHoursRemaining": summary.daily_window_hours_remaining,
        "cycleHoursUsed": summary.cycle_hours_used,
        "cycleHoursRemaining": summary.cycle_hours_remaining,
        "restartPerformed": summary.restart_performed,
        "nextRequiredStop": _event_payload(summary.next_required_stop, event_ids.get(id(summary.next_required_stop)))
        if summary.next_required_stop
        else None,
        "summary": summary.summary,
    }


def _daily_log_payload(log: DailyLog) -> dict:
    return {
        "date": log.date,
        "events": [_event_payload(event) for event in log.events],
        "totalsMinutes": log.totals_minutes,
        "remarks": list(log.remarks),
    }
