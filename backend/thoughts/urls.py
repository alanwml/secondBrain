from django.urls import path

from . import views


urlpatterns = [
    path("health/", views.health_check, name="health-check"),
    path("settings/provider/", views.provider_status, name="provider-status"),
    path("graph/", views.graph_data, name="graph-data"),
    path("thoughts/", views.thoughts_collection, name="thoughts-collection"),
    path("thoughts/<uuid:thought_id>/", views.thought_detail, name="thought-detail"),
    path("thoughts/<uuid:thought_id>/analysis/", views.request_thought_analysis, name="request-analysis"),
    path("thoughts/<uuid:thought_id>/context/", views.select_thought_context, name="select-context"),
    path("thoughts/<uuid:thought_id>/connections/", views.thought_connections, name="thought-connections"),
    path("connections/<int:connection_id>/", views.connection_detail, name="connection-detail"),
]
