"""HTTP entry points. Routing and HOS orchestration arrive in later checkpoints."""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from trips.here_client import HereClient, HereClientError
from trips.serializers import TripPlanRequestSerializer


class HealthView(APIView):
    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request):
        return Response({"status": "ok", "service": "linehaul-ledger-api"})


class LocationSuggestView(APIView):
    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response(
                {"error": {"code": "validation_error", "message": "Enter at least 2 characters."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            limit = min(max(int(request.query_params.get("limit", 5)), 1), 10)
        except ValueError:
            return Response(
                {"error": {"code": "validation_error", "message": "Limit must be a number from 1 through 10."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            suggestions = HereClient().suggest(query, limit)
        except HereClientError:
            return Response(
                {"error": {"code": "locations_unavailable", "message": "Location suggestions are temporarily unavailable."}},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"suggestions": [suggestion.as_dict() for suggestion in suggestions]})


class TripPlanView(APIView):
    """Validate the stable plan contract before planning is implemented."""

    def post(self, request):
        serializer = TripPlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            {
                "error": {
                    "code": "not_implemented",
                    "message": "Trip scheduling is not available yet.",
                }
            },
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )
