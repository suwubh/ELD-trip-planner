import pytest
from rest_framework.test import APIClient

from trips.contracts import Position
from trips.here_client import HereTimeoutError, LocationSuggestion


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


def test_health_endpoint_returns_json(api_client: APIClient) -> None:
    response = api_client.get("/api/v1/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "linehaul-ledger-api"}


def test_trip_plan_rejects_invalid_cycle_hours(api_client: APIClient) -> None:
    response = api_client.post(
        "/api/v1/trips/plan",
        {
            "currentLocation": {"query": "Chicago, IL"},
            "pickupLocation": {"query": "Indianapolis, IN"},
            "dropoffLocation": {"query": "Columbus, OH"},
            "currentCycleUsedHours": 71,
            "startTime": "2026-09-09T09:15:00-05:00",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["fields"]["currentCycleUsedHours"] == [
        "Enter a number from 0 through 70."
    ]


def test_trip_plan_returns_safe_routing_error_after_valid_input(api_client: APIClient) -> None:
    response = api_client.post(
        "/api/v1/trips/plan",
        {
            "currentLocation": {"query": "Chicago, IL"},
            "pickupLocation": {"query": "Indianapolis, IN"},
            "dropoffLocation": {"query": "Columbus, OH"},
            "currentCycleUsedHours": 42.5,
            "startTime": "2026-09-09T09:15:00-05:00",
        },
        format="json",
    )

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "routing_unavailable"


def test_location_suggestions_are_returned_from_here_client(api_client: APIClient, monkeypatch) -> None:
    monkeypatch.setattr(
        "trips.views.HereClient.suggest",
        lambda _self, _query, _limit: [
            LocationSuggestion("here:1", "Chicago, IL", "Chicago, IL, United States", Position(41.8781, -87.6298))
        ],
    )

    response = api_client.get("/api/v1/locations/suggest?q=Chicago")

    assert response.status_code == 200
    assert response.json()["suggestions"][0]["label"] == "Chicago, IL"


def test_location_suggestions_handle_here_timeout(api_client: APIClient, monkeypatch) -> None:
    def raise_timeout(*_args, **_kwargs):
        raise HereTimeoutError()

    monkeypatch.setattr("trips.views.HereClient.suggest", raise_timeout)

    response = api_client.get("/api/v1/locations/suggest?q=Chicago")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "locations_unavailable"
