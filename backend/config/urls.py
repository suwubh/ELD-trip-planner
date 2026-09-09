"""Top-level URL routes for the Linehaul Ledger API."""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("trips.urls")),
]
