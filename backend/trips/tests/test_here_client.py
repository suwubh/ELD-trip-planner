from unittest.mock import patch

import pytest

from trips.contracts import Position
from trips.here_client import (
    HereClient,
    HereNotFoundError,
    HereResponseError,
    HereTimeoutError,
    LocationSuggestion,
    decode_flexible_polyline,
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


def test_suggest_normalizes_here_response() -> None:
    response = FakeResponse(
        b'{"items":[{"id":"here:1","title":"Chicago, IL","address":{"label":"Chicago, IL, United States"},"position":{"lat":41.8781,"lng":-87.6298}}]}'
    )
    with patch("trips.here_client.urlopen", return_value=response) as urlopen:
        results = HereClient(api_key="test-key").suggest("Chicago", limit=3)

    assert results == [
        LocationSuggestion(
            id="here:1",
            label="Chicago, IL",
            address="Chicago, IL, United States",
            position=Position(41.8781, -87.6298),
        )
    ]
    assert "autosuggest.search.hereapi.com" in urlopen.call_args.args[0]
    assert "apiKey=test-key" in urlopen.call_args.args[0]


def test_geocode_empty_results_is_a_clear_failure() -> None:
    with patch("trips.here_client.urlopen", return_value=FakeResponse(b'{"items":[]}')):
        with pytest.raises(HereNotFoundError):
            HereClient(api_key="test-key").geocode("nowhere")


def test_routing_response_without_sections_is_rejected() -> None:
    location = HereClient(api_key="test-key")
    current = location._location_from_item({"title": "A", "position": {"lat": 1, "lng": 1}})
    pickup = location._location_from_item({"title": "B", "position": {"lat": 2, "lng": 2}})
    dropoff = location._location_from_item({"title": "C", "position": {"lat": 3, "lng": 3}})
    with patch("trips.here_client.urlopen", return_value=FakeResponse(b'{"routes":[]}')):
        with pytest.raises(HereResponseError):
            location.truck_route(current, pickup, dropoff)


def test_timeout_is_classified_for_safe_api_handling() -> None:
    with patch("trips.here_client.urlopen", side_effect=TimeoutError):
        with pytest.raises(HereTimeoutError):
            HereClient(api_key="test-key").suggest("Chicago")


def test_decodes_here_flexible_polyline() -> None:
    points = decode_flexible_polyline("BFoz5xJ67i1B1B7PzIhaxL7Y")

    assert len(points) == 4
    assert points[0] == Position(50.10228, 8.69821)
    assert points[-1] == Position(50.09878, 8.68752)
