from django.urls import path

from trips.views import HealthView, TripPlanView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("trips/plan", TripPlanView.as_view(), name="trip-plan"),
]
