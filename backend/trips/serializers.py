import re
from datetime import datetime
from rest_framework import serializers

OFFSET_PATTERN = re.compile(r"(Z|[+-]\d{2}:?\d{2})$")


class PositionSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90.0, max_value=90.0)
    lng = serializers.FloatField(min_value=-180.0, max_value=180.0)


class LocationInputSerializer(serializers.Serializer):
    query = serializers.CharField(max_length=200, trim_whitespace=True)
    position = PositionSerializer(required=False, allow_null=True)
    address = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def to_internal_value(self, data):
        if isinstance(data, str):
            data = {"query": data}
        return super().to_internal_value(data)

    def validate_query(self, value: str) -> str:
        if not value:
            raise serializers.ValidationError("A location is required.")
        return value


class TripPlanRequestSerializer(serializers.Serializer):
    currentLocation = LocationInputSerializer()
    pickupLocation = LocationInputSerializer()
    dropoffLocation = LocationInputSerializer()
    currentCycleUsedHours = serializers.FloatField(
        min_value=0,
        max_value=70,
        error_messages={
            "min_value": "Enter a number from 0 through 70.",
            "max_value": "Enter a number from 0 through 70.",
            "invalid": "Enter a number from 0 through 70.",
        },
    )
    startTime = serializers.DateTimeField(required=False)

    def to_internal_value(self, data):
        if isinstance(data, dict):
            normalized = dict(data)
            mapping = {
                "current_location": "currentLocation",
                "pickup_location": "pickupLocation",
                "dropoff_location": "dropoffLocation",
                "current_cycle_used_hours": "currentCycleUsedHours",
                "start_time": "startTime",
            }
            for snake, camel in mapping.items():
                if snake in normalized and camel not in normalized:
                    normalized[camel] = normalized[snake]
            if "startTime" not in normalized or not normalized["startTime"]:
                from datetime import timezone
                normalized["startTime"] = datetime.now(timezone.utc).replace(second=0, microsecond=0).isoformat()
            data = normalized
        return super().to_internal_value(data)

    def validate_startTime(self, value: datetime) -> datetime:
        raw = self.initial_data.get("startTime") or self.initial_data.get("start_time")
        if isinstance(raw, str) and not OFFSET_PATTERN.search(raw.strip()):
            raise serializers.ValidationError("startTime must include a timezone offset (e.g. 2026-09-10T08:00:00-05:00).")
        if value.tzinfo is None or value.utcoffset() is None:
            raise serializers.ValidationError("startTime must include a timezone offset (e.g. 2026-09-10T08:00:00-05:00).")
        return value.replace(second=0, microsecond=0)

