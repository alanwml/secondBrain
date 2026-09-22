from django.conf import settings
from django.db.models import Q, QuerySet
from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import AnalysisJob, NoteConnection, Thought
from .serializers import AnalysisJobSerializer, NoteConnectionSerializer, ThoughtSerializer
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


def _active_connections():
    return NoteConnection.objects.filter(status__in=[NoteConnection.Status.CONFIRMED, NoteConnection.Status.SUGGESTED]).select_related("source_thought", "target_thought")


def _connection_queryset_for(thought_id):
    return _active_connections().filter(Q(source_thought_id=thought_id) | Q(target_thought_id=thought_id))


@api_view(["GET", "POST"])
def thought_connections(request, thought_id):
    try:
        thought = Thought.objects.get(id=thought_id)
    except (Thought.DoesNotExist, ValueError):
        return Response({"error": {"code": "not_found", "message": "Thought not found."}}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(NoteConnectionSerializer(_connection_queryset_for(thought.id), many=True).data)

    target_id = request.data.get("target_thought_id")
    relationship_type = request.data.get("relationship_type", NoteConnection.RelationshipType.RELATED)
    if not target_id or relationship_type not in NoteConnection.RelationshipType.values:
        return Response({"error": {"code": "invalid_input", "message": "A target thought and valid relationship type are required."}}, status=status.HTTP_400_BAD_REQUEST)
    try:
        target = Thought.objects.get(id=target_id)
    except (Thought.DoesNotExist, ValueError):
        return Response({"error": {"code": "target_not_found", "message": "Target thought not found."}}, status=status.HTTP_404_NOT_FOUND)
    if target.id == thought.id:
        return Response({"error": {"code": "invalid_input", "message": "A thought cannot connect to itself."}}, status=status.HTTP_400_BAD_REQUEST)

    source, destination = thought, target
    if relationship_type == NoteConnection.RelationshipType.RELATED and str(source.id) > str(destination.id):
        source, destination = destination, source
    connection, created = NoteConnection.objects.get_or_create(
        source_thought=source,
        target_thought=destination,
        relationship_type=relationship_type,
        defaults={"description": str(request.data.get("description", "")).strip(), "origin": NoteConnection.Origin.MANUAL, "status": NoteConnection.Status.CONFIRMED},
    )
    if not created:
        connection.description = str(request.data.get("description", connection.description)).strip()
        connection.status = NoteConnection.Status.CONFIRMED
        connection.origin = NoteConnection.Origin.MANUAL
        connection.save(update_fields=["description", "status", "origin", "updated_at"])
    return Response(NoteConnectionSerializer(connection).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(["PATCH", "DELETE"])
def connection_detail(request, connection_id):
    try:
        connection = NoteConnection.objects.select_related("source_thought", "target_thought").get(id=connection_id)
    except (NoteConnection.DoesNotExist, ValueError):
        return Response({"error": {"code": "not_found", "message": "Connection not found."}}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        connection.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if "relationship_type" in request.data and request.data["relationship_type"] not in NoteConnection.RelationshipType.values:
        return Response({"error": {"code": "invalid_input", "message": "Invalid relationship type."}}, status=status.HTTP_400_BAD_REQUEST)
    for field in ["relationship_type", "description", "status"]:
        if field in request.data:
            setattr(connection, field, request.data[field])
    connection.save()
    return Response(NoteConnectionSerializer(connection).data)


@api_view(["GET"])
def graph_data(request):
    focus = request.query_params.get("focus")
    try:
        depth = max(1, min(int(request.query_params.get("depth", "1")), 3))
    except ValueError:
        depth = 1
    relationship_type = request.query_params.get("relationship_type")
    thought_type = request.query_params.get("thought_type")
    include_suggested = request.query_params.get("include_suggested", "true").lower() == "true"
    connections = _active_connections()
    if not include_suggested:
        connections = connections.filter(status=NoteConnection.Status.CONFIRMED)
    if relationship_type in NoteConnection.RelationshipType.values:
        connections = connections.filter(relationship_type=relationship_type)
    connections = list(connections)
    node_ids = {str(focus)} if focus else set()
    if focus:
        frontier = {str(focus)}
        for _ in range(depth):
            next_frontier = set()
            for connection in connections:
                source_id, target_id = str(connection.source_thought_id), str(connection.target_thought_id)
                if source_id in frontier:
                    next_frontier.add(target_id)
                if target_id in frontier:
                    next_frontier.add(source_id)
            next_frontier -= node_ids
            node_ids |= next_frontier
            frontier = next_frontier
    thoughts = Thought.objects.filter(id__in=node_ids if focus else Thought.objects.all()).order_by("-created_at")
    if thought_type in Thought.ThoughtType.values:
        thoughts = thoughts.filter(type=thought_type)
    visible_node_ids = {str(note.id) for note in thoughts}
    connections = [edge for edge in connections if str(edge.source_thought_id) in visible_node_ids and str(edge.target_thought_id) in visible_node_ids]
    nodes = [{"id": str(note.id), "text": note.text, "type": note.type, "pinned": note.pinned, "focused": str(note.id) == str(focus)} for note in thoughts]
    return Response({"nodes": nodes, "edges": NoteConnectionSerializer(connections, many=True).data, "focus": focus, "depth": depth})
