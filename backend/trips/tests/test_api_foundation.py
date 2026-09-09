import pytest
from rest_framework.test import APIClient


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


def test_trip_plan_validates_before_not_implemented_response(api_client: APIClient) -> None:
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

    assert response.status_code == 501
    assert response.json()["error"]["code"] == "not_implemented"
