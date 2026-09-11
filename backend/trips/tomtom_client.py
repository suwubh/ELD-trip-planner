"""Small, mockable TomTom search and truck-routing client."""

import http.client
import json
import os
import socket
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from trips.contracts import Location, Position, Route, RouteLeg

TOMTOM_BASE_URL = "https://api.tomtom.com"
SEARCH_URL = f"{TOMTOM_BASE_URL}/search/2/search"
ROUTING_URL = f"{TOMTOM_BASE_URL}/routing/1/calculateRoute"
METERS_PER_MILE = 1609.344


class TomTomClientError(Exception):
    """Expected TomTom integration failure safe to translate at the API boundary."""


class TomTomConfigurationError(TomTomClientError):
    pass


class TomTomTimeoutError(TomTomClientError):
    pass


class TomTomNotFoundError(TomTomClientError):
    pass


class TomTomResponseError(TomTomClientError):
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


class TomTomClient:
    def __init__(self, api_key: str | None = None, timeout_seconds: float = 8.0):
        self.api_key = api_key if api_key is not None else os.getenv("TOMTOM_API_KEY", "")
        self.timeout_seconds = timeout_seconds

    def suggest(self, query: str, limit: int = 5) -> list[LocationSuggestion]:
        payload = self._search(query, limit=limit, typeahead=True)
        suggestions: list[LocationSuggestion] = []
        for result in payload.get("results", []):
            if not isinstance(result, dict):
                continue
            try:
                location = self._location_from_result(result)
            except TomTomResponseError:
                continue
            suggestions.append(
                LocationSuggestion(
                    id=location.provider_id or location.label,
                    label=location.label,
                    address=location.address,
                    position=location.position,
                )
            )
        return suggestions

    def geocode(self, query: str) -> Location:
        payload = self._search(query, limit=1)
        results = payload.get("results", [])
        if not isinstance(results, list) or not results:
            raise TomTomNotFoundError("No matching location")
        if not isinstance(results[0], dict):
            raise TomTomResponseError("TomTom geocoding result is invalid")
        return self._location_from_result(results[0])

    def truck_route(self, current: Location, pickup: Location, dropoff: Location) -> Route:
        first = self._route_leg(current, pickup)
        second = self._route_leg(pickup, dropoff)
        geometry = list(first.geometry)
        if geometry and second.geometry and geometry[-1] == second.geometry[0]:
            geometry.extend(second.geometry[1:])
        else:
            geometry.extend(second.geometry)
        return Route(
            legs=(first, second),
            distance_miles=first.distance_miles + second.distance_miles,
            duration_minutes=first.duration_minutes + second.duration_minutes,
            geometry=tuple(geometry),
        )

    def _search(self, query: str, *, limit: int, typeahead: bool = False) -> dict[str, Any]:
        encoded_query = quote(query.strip(), safe="")
        params: dict[str, str | int | bool] = {"key": self._api_key(), "limit": limit}
        if typeahead:
            params["typeahead"] = "true"
        return self._get(f"{SEARCH_URL}/{encoded_query}.json", params)

    def _route_leg(self, origin: Location, destination: Location) -> RouteLeg:
        locations = ":".join((self._location_segment(origin.position), self._location_segment(destination.position)))
        payload = self._get(
            f"{ROUTING_URL}/{locations}/json",
            {
                "key": self._api_key(),
                "travelMode": "truck",
                "vehicleCommercial": "true",
            },
        )
        try:
            route = payload["routes"][0]
            summary = route["summary"]
            distance = summary["lengthInMeters"]
            duration = summary["travelTimeInSeconds"]
            points = route["legs"][0]["points"]
            geometry = tuple(self._position_from_point(point) for point in points)
            if not geometry or not isinstance(distance, (int, float)) or not isinstance(duration, (int, float)):
                raise ValueError("missing route values")
        except (IndexError, KeyError, TypeError, ValueError) as exc:
            raise TomTomResponseError("TomTom did not return a usable truck route") from exc
        return RouteLeg(origin, destination, float(distance) / METERS_PER_MILE, round(float(duration) / 60), geometry)

    def _get(self, base_url: str, params: dict[str, str | int | bool]) -> dict[str, Any]:
        return self._request(f"{base_url}?{urlencode(params)}")

    def _api_key(self) -> str:
        if not self.api_key:
            raise TomTomConfigurationError("TOMTOM_API_KEY is not configured")
        return self.api_key

    def _request(self, url: str) -> dict[str, Any]:
        request = Request(url, headers={"Accept": "application/json"})
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:  # noqa: S310 - fixed HTTPS host
                payload = json.loads(response.read().decode("utf-8"))
        except (TimeoutError, socket.timeout) as exc:
            raise TomTomTimeoutError("TomTom request timed out") from exc
        except HTTPError as exc:
            raise TomTomResponseError("TomTom returned an HTTP error") from exc
        except (URLError, OSError, json.JSONDecodeError, http.client.HTTPException) as exc:
            raise TomTomResponseError("TomTom request failed") from exc
        if not isinstance(payload, dict):
            raise TomTomResponseError("TomTom returned an invalid payload")
        return payload

    @staticmethod
    def _location_segment(position: Position) -> str:
        return f"{position.lat},{position.lng}"

    @staticmethod
    def _location_from_result(result: dict[str, Any]) -> Location:
        try:
            address_data = result.get("address")
            if not isinstance(address_data, dict):
                raise ValueError("missing address")
            address = str(address_data.get("freeformAddress") or "").strip()
            poi_data = result.get("poi")
            poi_name = str(poi_data.get("name") or "").strip() if isinstance(poi_data, dict) else ""
            label = ", ".join(part for part in (poi_name, address) if part) or str(result.get("type") or "").strip()
            if not label:
                raise ValueError("missing label")
            return Location(
                label=label,
                address=address or None,
                provider_id=str(result.get("id") or "") or None,
                position=TomTomClient._position_from_point(result["position"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise TomTomResponseError("TomTom geocoding result is invalid") from exc

    @staticmethod
    def _position_from_point(point: object) -> Position:
        if not isinstance(point, dict):
            raise ValueError("invalid coordinate")
        lat = point.get("lat", point.get("latitude"))
        lng = point.get("lon", point.get("longitude"))
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            raise ValueError("invalid coordinate")
        return Position(lat=float(lat), lng=float(lng))
