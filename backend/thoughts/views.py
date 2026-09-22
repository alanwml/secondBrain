from django.db.models import QuerySet
from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import AnalysisJob, Thought
from .serializers import AnalysisJobSerializer, ThoughtSerializer
from .services import create_thought, enqueue_analysis


def _thought_queryset() -> QuerySet:
    """Return the local development dataset.

    Authentication is deliberately not enabled in this first migration step.
    The nullable user field lets the importer and local single-user workflow
    work now, while leaving a clear place to add ownership later.
    """
    return Thought.objects.all().prefetch_related("analyses", "analysis_jobs")


@api_view(["GET", "POST"])
def thoughts_collection(request):
    if request.method == "GET":
        return Response(ThoughtSerializer(_thought_queryset(), many=True).data)

    try:
        thought = create_thought(data=request.data)
    except ValueError as error:
        return Response({"error": {"code": "invalid_input", "message": str(error)}}, status=status.HTTP_400_BAD_REQUEST)

    if request.data.get("request_analysis") and thought.type != Thought.ThoughtType.TASK:
        enqueue_analysis(thought=thought)

    return Response(ThoughtSerializer(thought).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
def thought_detail(request, thought_id):
    try:
        thought = _thought_queryset().get(id=thought_id)
    except (Thought.DoesNotExist, ValueError):
        return Response({"error": {"code": "not_found", "message": "Thought not found."}}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(ThoughtSerializer(thought).data)

    if request.method == "DELETE":
        thought.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    allowed_fields = {"text", "type", "pinned", "completed", "selected_context", "context_status"}
    for field, value in request.data.items():
        if field in allowed_fields:
            setattr(thought, field, value)
    thought.save()
    return Response(ThoughtSerializer(thought).data)


@api_view(["POST"])
def request_thought_analysis(request, thought_id):
    try:
        thought = Thought.objects.get(id=thought_id)
    except (Thought.DoesNotExist, ValueError):
        return Response({"error": {"code": "not_found", "message": "Thought not found."}}, status=status.HTTP_404_NOT_FOUND)

    if thought.type == Thought.ThoughtType.TASK:
        return Response({"error": {"code": "invalid_type", "message": "Tasks cannot be analyzed."}}, status=status.HTTP_400_BAD_REQUEST)

    if thought.analyses.filter(status="completed").exists():
        return Response(
            {"error": {"code": "analysis_exists", "message": "This thought already has a completed analysis."}},
            status=status.HTTP_409_CONFLICT,
        )

    active_job = thought.analysis_jobs.filter(status__in=[AnalysisJob.Status.QUEUED, AnalysisJob.Status.PROCESSING]).first()
    if active_job:
        return Response(AnalysisJobSerializer(active_job).data, status=status.HTTP_202_ACCEPTED)

    job = enqueue_analysis(thought=thought)
    return Response(AnalysisJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


@api_view(["GET"])
def health_check(request):
    return JsonResponse({"status": "ok", "service": "second-brain-backend"})
