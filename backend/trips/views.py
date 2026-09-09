"""HTTP entry points. Routing and HOS orchestration arrive in later checkpoints."""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from trips.serializers import TripPlanRequestSerializer


class HealthView(APIView):
    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request):
        return Response({"status": "ok", "service": "linehaul-ledger-api"})


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
