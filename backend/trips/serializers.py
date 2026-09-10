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
    startTime = serializers.DateTimeField()

    def validate_startTime(self, value: datetime) -> datetime:
        raw = self.initial_data.get("startTime")
        if isinstance(raw, str) and not OFFSET_PATTERN.search(raw.strip()):
            raise serializers.ValidationError("startTime must include a timezone offset (e.g. 2026-09-10T08:00:00-05:00).")
        if value.tzinfo is None or value.utcoffset() is None:
            raise serializers.ValidationError("startTime must include a timezone offset (e.g. 2026-09-10T08:00:00-05:00).")
        return value
