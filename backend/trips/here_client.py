"""Small, mockable HERE Geocoding/Search and Routing v8 client."""

import json
import os
import socket
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from trips.contracts import Location, Position, Route, RouteLeg

GEOCODE_URL = "https://geocode.search.hereapi.com/v1/geocode"
AUTOSUGGEST_URL = "https://autosuggest.search.hereapi.com/v1/autosuggest"
ROUTING_URL = "https://router.hereapi.com/v8/routes"
METERS_PER_MILE = 1609.344


class HereClientError(Exception):
    """Expected HERE integration failure safe to translate at the API boundary."""


class HereConfigurationError(HereClientError):
    pass


class HereTimeoutError(HereClientError):
    pass


class HereNotFoundError(HereClientError):
    pass


class HereResponseError(HereClientError):
    pass


@dataclass(frozen=True, slots=True)
class LocationSuggestion:
    id: str
    label: str
    address: str | None
    position: Position

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "address": self.address,
            "position": {"lat": self.position.lat, "lng": self.position.lng},
        }


class HereClient:
    def __init__(self, api_key: str | None = None, timeout_seconds: float = 8.0):
        self.api_key = api_key if api_key is not None else os.getenv("HERE_API_KEY", "")
        self.timeout_seconds = timeout_seconds

    def suggest(self, query: str, limit: int = 5) -> list[LocationSuggestion]:
        payload = self._get(
            AUTOSUGGEST_URL,
            {"q": query, "at": "39.8283,-98.5795", "limit": limit},
        )
        suggestions = []
        for item in payload.get("items", []):
            if not isinstance(item, dict) or not isinstance(item.get("position"), dict):
                continue
            suggestions.append(self._suggestion_from_item(item))
        return suggestions

    def geocode(self, query: str) -> Location:
        payload = self._get(GEOCODE_URL, {"q": query, "limit": 1})
        items = payload.get("items", [])
        if not items:
            raise HereNotFoundError("No matching location")
        return self._location_from_item(items[0])

    def truck_route(self, current: Location, pickup: Location, dropoff: Location) -> Route:
        payload = self._get(
            ROUTING_URL,
            {
                "transportMode": "truck",
                "routingMode": "fast",
                "origin": self._coordinate(current.position),
                "via": self._coordinate(pickup.position),
                "destination": self._coordinate(dropoff.position),
                "return": "summary,polyline",
            },
        )
        routes = payload.get("routes", [])
        if not routes or not routes[0].get("sections"):
            raise HereResponseError("HERE did not return a usable truck route")
        sections = routes[0]["sections"]
        stops = (current, pickup, dropoff)
        legs: list[RouteLeg] = []
        geometry: list[Position] = []
        total_meters = 0.0
        total_seconds = 0
        for index, section in enumerate(sections):
            summary = section.get("summary") or {}
            length = summary.get("length")
            duration = summary.get("duration")
            if not isinstance(length, (int, float)) or not isinstance(duration, int):
                raise HereResponseError("HERE route section has no usable summary")
            points = decode_flexible_polyline(section.get("polyline", ""))
            if geometry and points and geometry[-1] == points[0]:
                points = points[1:]
            geometry.extend(points)
            origin = stops[min(index, len(stops) - 2)]
            destination = stops[min(index + 1, len(stops) - 1)]
            legs.append(
                RouteLeg(origin, destination, length / METERS_PER_MILE, round(duration / 60), tuple(points))
            )
            total_meters += length
            total_seconds += duration
        return Route(tuple(legs), total_meters / METERS_PER_MILE, round(total_seconds / 60), tuple(geometry))

    def _get(self, base_url: str, params: dict[str, Any]) -> dict[str, Any]:
        if not self.api_key:
            raise HereConfigurationError("HERE_API_KEY is not configured")
        url = f"{base_url}?{urlencode({**params, 'apiKey': self.api_key})}"
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:  # noqa: S310 - fixed HTTPS hosts
                payload = json.loads(response.read().decode("utf-8"))
        except (TimeoutError, socket.timeout) as exc:
            raise HereTimeoutError("HERE request timed out") from exc
        except HTTPError as exc:
            raise HereResponseError("HERE returned an HTTP error") from exc
        except (URLError, OSError, json.JSONDecodeError) as exc:
            raise HereResponseError("HERE request failed") from exc
        if not isinstance(payload, dict):
            raise HereResponseError("HERE returned an invalid payload")
        return payload

    @staticmethod
    def _coordinate(position: Position) -> str:
        return f"{position.lat},{position.lng}"

    @staticmethod
    def _suggestion_from_item(item: dict[str, Any]) -> LocationSuggestion:
        position = item["position"]
        return LocationSuggestion(
            id=str(item.get("id", "")),
            label=str(item.get("title", "")),
            address=(item.get("address") or {}).get("label"),
            position=Position(float(position["lat"]), float(position["lng"])),
        )

    @staticmethod
    def _location_from_item(item: dict[str, Any]) -> Location:
        try:
            position = item["position"]
            return Location(
                label=str(item["title"]),
                address=(item.get("address") or {}).get("label"),
                provider_id=item.get("id"),
                position=Position(float(position["lat"]), float(position["lng"])),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise HereResponseError("HERE geocoding result is invalid") from exc


_DECODING = {char: index for index, char in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")}


def decode_flexible_polyline(encoded: str) -> list[Position]:
    """Decode HERE's flexible-polyline format into latitude/longitude positions."""
    values = _decode_unsigned_values(encoded)
    if next(values, None) != 1:
        raise HereResponseError("Unsupported HERE flexible-polyline version")
    header = next(values, None)
    if header is None:
        raise HereResponseError("HERE flexible polyline has no header")
    precision, third_dimension = header & 15, (header >> 4) & 7
    third_dimension_precision = (header >> 7) & 15
    factor = 10**precision
    third_factor = 10**third_dimension_precision
    latitude = longitude = third = 0
    points: list[Position] = []
    try:
        while True:
            latitude += _decode_signed(next(values))
            longitude += _decode_signed(next(values))
            if third_dimension:
                third += _decode_signed(next(values))
                _ = third / third_factor
            points.append(Position(latitude / factor, longitude / factor))
    except StopIteration:
        if not points:
            raise HereResponseError("HERE flexible polyline contains no positions")
        return points


def _decode_unsigned_values(encoded: str):
    result = shift = 0
    for char in encoded:
        try:
            value = _DECODING[char]
        except KeyError as exc:
            raise HereResponseError("HERE flexible polyline contains an invalid character") from exc
        result |= (value & 31) << shift
        if value & 32:
            shift += 5
        else:
            yield result
            result = shift = 0
    if shift:
        raise HereResponseError("HERE flexible polyline is incomplete")


def _decode_signed(value: int) -> int:
    return -(value >> 1) - 1 if value & 1 else value >> 1
