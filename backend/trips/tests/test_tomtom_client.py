from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

import pytest

from trips.contracts import Position
from trips.tomtom_client import (
    LocationSuggestion,
    TomTomClient,
    TomTomNotFoundError,
    TomTomResponseError,
    TomTomTimeoutError,
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


SEARCH_RESULT = b'{"results":[{"id":"US/GEO/CHICAGO","type":"Geography","address":{"freeformAddress":"Chicago, IL"},"position":{"lat":41.8781,"lon":-87.6298}}]}'
ROUTE_RESULT = b'{"routes":[{"summary":{"lengthInMeters":1609.344,"travelTimeInSeconds":3600},"legs":[{"points":[{"latitude":40,"longitude":-90},{"latitude":41,"longitude":-89}]}]}]}'


def test_suggest_normalizes_tomtom_response_and_keeps_key_server_side() -> None:
    with patch("trips.tomtom_client.urlopen", return_value=FakeResponse(SEARCH_RESULT)) as urlopen:
        results = TomTomClient(api_key="test-key").suggest("Chicago", limit=3)

    assert results == [
        LocationSuggestion(
            id="US/GEO/CHICAGO",
            label="Chicago, IL",
            address="Chicago, IL",
            position=Position(41.8781, -87.6298),
        )
    ]
    request = urlopen.call_args.args[0]
    parsed = urlparse(request.full_url)
    assert parsed.path == "/search/2/search/Chicago.json"
    assert parse_qs(parsed.query) == {"key": ["test-key"], "limit": ["3"], "typeahead": ["true"]}
    assert request.get_header("Authorization") is None


def test_geocode_empty_results_is_a_clear_failure() -> None:
    with patch("trips.tomtom_client.urlopen", return_value=FakeResponse(b'{"results":[]}')):
        with pytest.raises(TomTomNotFoundError):
            TomTomClient(api_key="test-key").geocode("nowhere")


def test_truck_route_is_normalized_into_two_legs() -> None:
    client = TomTomClient(api_key="test-key")
    current = client._location_from_result({"id": "current", "address": {"freeformAddress": "Current"}, "position": {"lat": 40, "lon": -90}})
    pickup = client._location_from_result({"id": "pickup", "address": {"freeformAddress": "Pickup"}, "position": {"lat": 41, "lon": -89}})
    dropoff = client._location_from_result({"id": "dropoff", "address": {"freeformAddress": "Dropoff"}, "position": {"lat": 42, "lon": -88}})
    with patch("trips.tomtom_client.urlopen", return_value=FakeResponse(ROUTE_RESULT)) as urlopen:
        route = client.truck_route(current, pickup, dropoff)

    assert len(route.legs) == 2
    assert route.distance_miles == 2
    assert route.duration_minutes == 120
    assert route.geometry[0] == Position(40, -90)
    assert route.geometry[-1] == Position(41, -89)
    request = urlopen.call_args.args[0]
    parsed = urlparse(request.full_url)
    assert parsed.path == "/routing/1/calculateRoute/41.0,-89.0:42.0,-88.0/json"
    assert parse_qs(parsed.query) == {"key": ["test-key"], "travelMode": ["truck"], "vehicleCommercial": ["true"]}


def test_routing_response_without_a_route_is_rejected() -> None:
    client = TomTomClient(api_key="test-key")
    current = client._location_from_result({"id": "current", "address": {"freeformAddress": "Current"}, "position": {"lat": 40, "lon": -90}})
    pickup = client._location_from_result({"id": "pickup", "address": {"freeformAddress": "Pickup"}, "position": {"lat": 41, "lon": -89}})
    dropoff = client._location_from_result({"id": "dropoff", "address": {"freeformAddress": "Dropoff"}, "position": {"lat": 42, "lon": -88}})
    with patch("trips.tomtom_client.urlopen", return_value=FakeResponse(b'{"routes":[]}')):
        with pytest.raises(TomTomResponseError):
            client.truck_route(current, pickup, dropoff)


def test_timeout_is_classified_for_safe_api_handling() -> None:
    with patch("trips.tomtom_client.urlopen", side_effect=TimeoutError):
        with pytest.raises(TomTomTimeoutError):
            TomTomClient(api_key="test-key").suggest("Chicago")
