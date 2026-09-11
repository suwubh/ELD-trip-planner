from django.urls import re_path

from trips.views import HealthView, LocationSuggestView, TripPlanView

urlpatterns = [
    re_path(r"^health/?$", HealthView.as_view(), name="health"),
    re_path(r"^locations/suggest/?$", LocationSuggestView.as_view(), name="location-suggest"),
    re_path(r"^trips/plan/?$", TripPlanView.as_view(), name="trip-plan"),
]

