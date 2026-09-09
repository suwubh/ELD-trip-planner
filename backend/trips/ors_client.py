"""Small, mockable openrouteservice geocoding and HGV-routing client."""

import json
import os
import socket
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from trips.contracts import Location, Position, Route, RouteLeg

ORS_BASE_URL = "https://api.heigit.org"
GEOCODE_URL = f"{ORS_BASE_URL}/pelias/v1/search"
AUTOCOMPLETE_URL = f"{ORS_BASE_URL}/pelias/v1/autocomplete"
HGV_DIRECTIONS_URL = f"{ORS_BASE_URL}/openrouteservice/v2/directions/driving-hgv/geojson"
METERS_PER_MILE = 1609.344


class OrsClientError(Exception):
    """Expected ORS integration failure safe to translate at the API boundary."""


class OrsConfigurationError(OrsClientError):
    pass


class OrsTimeoutError(OrsClientError):
    pass


class OrsNotFoundError(OrsClientError):
    pass


class OrsResponseError(OrsClientError):
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


class OrsClient:
    def __init__(self, api_key: str | None = None, timeout_seconds: float = 8.0):
        self.api_key = api_key if api_key is not None else os.getenv("ORS_API_KEY", "")
        self.timeout_seconds = timeout_seconds

    def suggest(self, query: str, limit: int = 5) -> list[LocationSuggestion]:
        payload = self._get(AUTOCOMPLETE_URL, {"text": query, "size": limit})
        suggestions: list[LocationSuggestion] = []
        for feature in payload.get("features", []):
            if not self._is_feature(feature):
                continue
            try:
                suggestions.append(self._suggestion_from_feature(feature))
            except OrsResponseError:
                continue
        return suggestions

    def geocode(self, query: str) -> Location:
        payload = self._get(GEOCODE_URL, {"text": query, "size": 1})
        features = payload.get("features", [])
        if not features:
            raise OrsNotFoundError("No matching location")
        return self._location_from_feature(features[0])

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

    def _route_leg(self, origin: Location, destination: Location) -> RouteLeg:
        payload = self._post(
            HGV_DIRECTIONS_URL,
            {
                "coordinates": [self._coordinate(origin.position), self._coordinate(destination.position)],
                "instructions": False,
                "preference": "recommended",
            },
        )
        try:
            feature = payload["features"][0]
            summary = feature["properties"]["summary"]
            distance = summary["distance"]
            duration = summary["duration"]
            geometry = tuple(self._position_from_coordinate(coordinate) for coordinate in feature["geometry"]["coordinates"])
            if not geometry or not isinstance(distance, (int, float)) or not isinstance(duration, (int, float)):
                raise ValueError("missing route values")
        except (IndexError, KeyError, TypeError, ValueError) as exc:
            raise OrsResponseError("ORS did not return a usable HGV route") from exc
        return RouteLeg(origin, destination, float(distance) / METERS_PER_MILE, round(float(duration) / 60), geometry)

    def _get(self, base_url: str, params: dict[str, Any]) -> dict[str, Any]:
        return self._request(f"{base_url}?{urlencode(params)}")

    def _post(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request(url, data=json.dumps(payload).encode("utf-8"))

    def _request(self, url: str, data: bytes | None = None) -> dict[str, Any]:
        if not self.api_key:
            raise OrsConfigurationError("ORS_API_KEY is not configured")
        headers = {"Authorization": self.api_key, "Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = Request(url, data=data, headers=headers, method="POST" if data is not None else "GET")
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:  # noqa: S310 - fixed HTTPS host
                payload = json.loads(response.read().decode("utf-8"))
        except (TimeoutError, socket.timeout) as exc:
            raise OrsTimeoutError("ORS request timed out") from exc
        except HTTPError as exc:
            raise OrsResponseError("ORS returned an HTTP error") from exc
        except (URLError, OSError, json.JSONDecodeError) as exc:
            raise OrsResponseError("ORS request failed") from exc
        if not isinstance(payload, dict):
            raise OrsResponseError("ORS returned an invalid payload")
        return payload

    @staticmethod
    def _coordinate(position: Position) -> list[float]:
        return [position.lng, position.lat]

    @staticmethod
    def _is_feature(feature: object) -> bool:
        return isinstance(feature, dict) and isinstance(feature.get("properties"), dict) and isinstance(feature.get("geometry"), dict)

    @classmethod
    def _suggestion_from_feature(cls, feature: dict[str, Any]) -> LocationSuggestion:
        location = cls._location_from_feature(feature)
        properties = feature["properties"]
        return LocationSuggestion(
            id=str(properties.get("gid") or properties.get("id") or ""),
            label=location.label,
            address=location.address,
            position=location.position,
        )

    @staticmethod
    def _location_from_feature(feature: dict[str, Any]) -> Location:
        try:
            properties = feature["properties"]
            label = str(properties.get("label") or properties.get("name") or "")
            if not label:
                raise ValueError("missing label")
            position = OrsClient._position_from_coordinate(feature["geometry"]["coordinates"])
            return Location(
                label=label,
                address=str(properties.get("label")) if properties.get("label") else None,
                provider_id=str(properties.get("gid") or properties.get("id") or "") or None,
                position=position,
            )
        except (KeyError, TypeError, ValueError, IndexError) as exc:
            raise OrsResponseError("ORS geocoding result is invalid") from exc

    @staticmethod
    def _position_from_coordinate(coordinate: object) -> Position:
        if not isinstance(coordinate, list) or len(coordinate) < 2:
            raise ValueError("invalid coordinate")
        return Position(lat=float(coordinate[1]), lng=float(coordinate[0]))
