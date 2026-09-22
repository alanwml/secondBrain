from django.urls import path

from . import views


urlpatterns = [
    path("health/", views.health_check, name="health-check"),
    path("thoughts/", views.thoughts_collection, name="thoughts-collection"),
    path("thoughts/<uuid:thought_id>/", views.thought_detail, name="thought-detail"),
    path("thoughts/<uuid:thought_id>/analysis/", views.request_thought_analysis, name="request-analysis"),
]
