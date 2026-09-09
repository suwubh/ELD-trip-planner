"""Request serializers for the versioned trip-planning API."""

from rest_framework import serializers


class LocationInputSerializer(serializers.Serializer):
    query = serializers.CharField(max_length=200, trim_whitespace=True)

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
