"""Consistent, credential-safe API error responses."""

from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """Wrap expected REST framework errors in the public API envelope."""
    response = exception_handler(exc, context)
    if response is None:
        return response

    if isinstance(exc, ValidationError):
        response.data = {
            "error": {
                "code": "validation_error",
                "message": "Some trip inputs are invalid.",
                "fields": response.data,
            }
        }
    elif isinstance(exc, NotFound):
        response.data = {
            "error": {"code": "not_found", "message": "The requested resource was not found."}
        }
    else:
        response.data = {
            "error": {
                "code": "request_error",
                "message": "The request could not be completed.",
            }
        }
    return response


def service_unavailable(message: str, code: str = "service_unavailable") -> Response:
    """Build a safe error for an unavailable upstream integration."""
    return Response(
        {"error": {"code": code, "message": message}},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )
