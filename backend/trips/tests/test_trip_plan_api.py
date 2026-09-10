from datetime import datetime

import pytest
from rest_framework.test import APIClient

from trips.contracts import Location, Position, Route, RouteLeg
from trips.tomtom_client import TomTomNotFoundError, TomTomResponseError, TomTomTimeoutError


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def route() -> Route:
    current = Location("Chicago, IL", Position(41.8781, -87.6298))
    pickup = Location("Indianapolis, IN", Position(39.7684, -86.1581))
    dropoff = Location("Columbus, OH", Position(39.9612, -82.9988))
    legs = (
        RouteLeg(current, pickup, 183.0, 210, (current.position, pickup.position)),
        RouteLeg(pickup, dropoff, 176.0, 200, (pickup.position, dropoff.position)),
    )
    return Route(legs, 359.0, 410, (current.position, pickup.position, dropoff.position))


def _payload() -> dict:
    return {
        "currentLocation": {"query": "Chicago, IL"},
        "pickupLocation": {"query": "Indianapolis, IN"},
        "dropoffLocation": {"query": "Columbus, OH"},
        "currentCycleUsedHours": 42.5,
        "startTime": "2026-09-09T09:15:00-05:00",
    }


def test_trip_plan_returns_normalized_route_events_and_daily_logs(api_client: APIClient, route: Route, monkeypatch) -> None:
    locations = [leg.origin for leg in route.legs] + [route.legs[-1].destination]
    monkeypatch.setattr("trips.views.TomTomClient.geocode", lambda _self, _query: locations.pop(0))
    monkeypatch.setattr("trips.views.TomTomClient.truck_route", lambda _self, *_locations: route)

    response = api_client.post("/api/v1/trips/plan", _payload(), format="json")

    assert response.status_code == 200
    body = response.json()
    assert body["trip"]["locations"]["pickup"]["label"] == "Indianapolis, IN"
    assert body["route"]["distanceMiles"] == 359.0
    assert body["route"]["geometry"][0] == [41.8781, -87.6298]
    assert [event["kind"] for event in body["events"]] == [
        "driving",
        "pickup_service",
        "driving",
        "dropoff_service",
    ]
    assert body["dailyLogs"][0]["totalsMinutes"]["driving"] == 410
    assert body["compliance"]["isCompliant"] is True


def test_trip_plan_maps_unresolved_location_to_actionable_error(api_client: APIClient, monkeypatch) -> None:
    monkeypatch.setattr("trips.views.TomTomClient.geocode", lambda *_args: (_ for _ in ()).throw(TomTomNotFoundError()))

    response = api_client.post("/api/v1/trips/plan", _payload(), format="json")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "location_not_found"


def test_trip_plan_maps_routing_failure_to_safe_error(api_client: APIClient, route: Route, monkeypatch) -> None:
    locations = [leg.origin for leg in route.legs] + [route.legs[-1].destination]
    monkeypatch.setattr("trips.views.TomTomClient.geocode", lambda _self, _query: locations.pop(0))
    monkeypatch.setattr(
        "trips.views.TomTomClient.truck_route",
        lambda *_args: (_ for _ in ()).throw(TomTomResponseError()),
    )

    response = api_client.post("/api/v1/trips/plan", _payload(), format="json")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "routing_unavailable"


def test_trip_plan_maps_timeout_to_gateway_timeout(api_client: APIClient, monkeypatch) -> None:
    monkeypatch.setattr("trips.views.TomTomClient.geocode", lambda *_args: (_ for _ in ()).throw(TomTomTimeoutError()))

    response = api_client.post("/api/v1/trips/plan", _payload(), format="json")

    assert response.status_code == 504
    assert response.json()["error"]["code"] == "routing_timeout"


def test_trip_plan_rejects_naive_start_time(api_client: APIClient) -> None:
    payload = _payload()
    payload["startTime"] = "2026-09-09T09:15:00"  # No timezone offset

    response = api_client.post("/api/v1/trips/plan", payload, format="json")

    assert response.status_code == 400
    assert "startTime" in response.json()["error"]["fields"]


def test_trip_plan_accepts_pre_resolved_positions(api_client: APIClient, route: Route, monkeypatch) -> None:
    geocode_called = []
    monkeypatch.setattr("trips.views.TomTomClient.geocode", lambda _self, query: geocode_called.append(query))
    monkeypatch.setattr("trips.views.TomTomClient.truck_route", lambda _self, *_locations: route)

    payload = {
        "currentLocation": {"query": "Chicago, IL", "position": {"lat": 41.8781, "lng": -87.6298}},
        "pickupLocation": {"query": "Indianapolis, IN", "position": {"lat": 39.7684, "lng": -86.1581}},
        "dropoffLocation": {"query": "Columbus, OH", "position": {"lat": 39.9612, "lng": -82.9988}},
        "currentCycleUsedHours": 10.0,
        "startTime": "2026-09-09T08:00:00-05:00",
    }

    response = api_client.post("/api/v1/trips/plan", payload, format="json")
    assert response.status_code == 200
    assert len(geocode_called) == 0  # No geocode calls made because positions were passed!
    data = response.json()
    assert "dayNumber" in data["dailyLogs"][0]
    assert "recap" in data["dailyLogs"][0]

