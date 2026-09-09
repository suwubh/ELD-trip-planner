import json
from unittest.mock import patch

import pytest

from trips.contracts import Position
from trips.ors_client import (
    LocationSuggestion,
    OrsClient,
    OrsNotFoundError,
    OrsResponseError,
    OrsTimeoutError,
)


class FakeResponse:
    def __init__(self, payload: bytes):
        self.payload = payload

    def read(self) -> bytes:
        return self.payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


FEATURE = b'{"features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[-87.6298,41.8781]},"properties":{"gid":"whosonfirst:locality:85940195","label":"Chicago, Illinois, United States","name":"Chicago"}}]}'


def test_suggest_normalizes_ors_response_and_authenticates_server_side() -> None:
    with patch("trips.ors_client.urlopen", return_value=FakeResponse(FEATURE)) as urlopen:
        results = OrsClient(api_key="test-key").suggest("Chicago", limit=3)

    assert results == [
        LocationSuggestion(
            id="whosonfirst:locality:85940195",
            label="Chicago, Illinois, United States",
            address="Chicago, Illinois, United States",
            position=Position(41.8781, -87.6298),
        )
    ]
    request = urlopen.call_args.args[0]
    assert request.full_url.startswith("https://api.heigit.org/pelias/v1/autocomplete?")
    assert request.get_header("Authorization") == "test-key"


def test_geocode_empty_results_is_a_clear_failure() -> None:
    with patch("trips.ors_client.urlopen", return_value=FakeResponse(b'{"features":[]}')):
        with pytest.raises(OrsNotFoundError):
            OrsClient(api_key="test-key").geocode("nowhere")


def test_hgv_route_is_normalized_into_two_legs_with_geojson_geometry() -> None:
    route_response = FakeResponse(
        b'{"features":[{"properties":{"summary":{"distance":1609.344,"duration":3600}},"geometry":{"coordinates":[[-90,40],[-89,41]]}}]}'
    )
    client = OrsClient(api_key="test-key")
    current = client._location_from_feature({"properties": {"label": "Current"}, "geometry": {"coordinates": [-90, 40]}})
    pickup = client._location_from_feature({"properties": {"label": "Pickup"}, "geometry": {"coordinates": [-89, 41]}})
    dropoff = client._location_from_feature({"properties": {"label": "Dropoff"}, "geometry": {"coordinates": [-88, 42]}})
    with patch("trips.ors_client.urlopen", return_value=route_response) as urlopen:
        route = client.truck_route(current, pickup, dropoff)

    assert len(route.legs) == 2
    assert route.distance_miles == 2
    assert route.duration_minutes == 120
    assert route.geometry[0] == Position(40, -90)
    assert route.geometry[-1] == Position(41, -89)
    request = urlopen.call_args.args[0]
    assert request.full_url == "https://api.heigit.org/openrouteservice/v2/directions/driving-hgv/geojson"
    assert json.loads(request.data) == {
        "coordinates": [[-89.0, 41.0], [-88.0, 42.0]],
        "instructions": False,
        "preference": "recommended",
    }


def test_routing_response_without_geojson_feature_is_rejected() -> None:
    client = OrsClient(api_key="test-key")
    current = client._location_from_feature({"properties": {"label": "Current"}, "geometry": {"coordinates": [-90, 40]}})
    pickup = client._location_from_feature({"properties": {"label": "Pickup"}, "geometry": {"coordinates": [-89, 41]}})
    dropoff = client._location_from_feature({"properties": {"label": "Dropoff"}, "geometry": {"coordinates": [-88, 42]}})
    with patch("trips.ors_client.urlopen", return_value=FakeResponse(b'{"features":[]}')):
        with pytest.raises(OrsResponseError):
            client.truck_route(current, pickup, dropoff)


def test_timeout_is_classified_for_safe_api_handling() -> None:
    with patch("trips.ors_client.urlopen", side_effect=TimeoutError):
        with pytest.raises(OrsTimeoutError):
            OrsClient(api_key="test-key").suggest("Chicago")
