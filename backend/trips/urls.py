from django.urls import path

from trips.views import HealthView, LocationSuggestView, TripPlanView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("locations/suggest", LocationSuggestView.as_view(), name="location-suggest"),
    path("trips/plan", TripPlanView.as_view(), name="trip-plan"),
]
