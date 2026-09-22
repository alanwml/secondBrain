from django.conf import settings
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


@api_view(["POST"])
def select_thought_context(request, thought_id):
    """Save a user's context choice and queue a focused re-analysis."""
    try:
        thought = Thought.objects.get(id=thought_id)
    except (Thought.DoesNotExist, ValueError):
        return Response({"error": {"code": "not_found", "message": "Thought not found."}}, status=status.HTTP_404_NOT_FOUND)

    raw_context = request.data.get("context", "")
    context = raw_context.strip() if isinstance(raw_context, str) else ""
    if not context:
        return Response({"error": {"code": "invalid_input", "message": "Context is required."}}, status=status.HTTP_400_BAD_REQUEST)

    if thought.context_decision_made:
        return Response(
            {"error": {"code": "context_already_selected", "message": "A context has already been selected for this thought."}},
            status=status.HTTP_409_CONFLICT,
        )

    if not thought.analyses.filter(status="completed").exists():
        return Response(
            {"error": {"code": "analysis_required", "message": "A completed analysis is required before choosing a context."}},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if context == "unresolved":
        thought.selected_context = None
        thought.context_status = Thought.ContextStatus.UNRESOLVED
        thought.context_decision_made = True
        thought.save(update_fields=["selected_context", "context_status", "context_decision_made", "updated_at"])
        return Response(ThoughtSerializer(thought).data)

    thought.selected_context = context
    thought.context_status = Thought.ContextStatus.RESOLVED
    thought.context_decision_made = True
    thought.save(update_fields=["selected_context", "context_status", "context_decision_made", "updated_at"])

    active_job = thought.analysis_jobs.filter(status__in=[AnalysisJob.Status.QUEUED, AnalysisJob.Status.PROCESSING]).first()
    job = active_job or enqueue_analysis(thought=thought)
    response = ThoughtSerializer(thought).data
    response["analysis_job"] = AnalysisJobSerializer(job).data
    return Response(response, status=status.HTTP_202_ACCEPTED)


@api_view(["GET"])
def health_check(request):
    return JsonResponse({"status": "ok", "service": "second-brain-backend"})


@api_view(["GET"])
def provider_status(request):
    return Response({"configured": bool(getattr(settings, "AI_API_KEY", "")), "provider": "OpenAI-compatible", "model": getattr(settings, "AI_MODEL", "gpt-5.5"), "base_url": getattr(settings, "AI_BASE_URL", "https://api.openai.com/v1")})
