import uuid

from django.db import transaction
from django.utils import timezone

from .ai import analyze_thought
from .models import Analysis, AnalysisJob, Thought


def create_thought(*, data: dict, user=None) -> Thought:
    """Create a thought while keeping the persistence rule in one place."""
    text = str(data.get("text", "")).strip()
    if not text:
        raise ValueError("Thought text is required.")

    thought_type = data.get("type", Thought.ThoughtType.NOTE)
    if thought_type not in Thought.ThoughtType.values:
        raise ValueError("Thought type must be note, task, or idea.")

    return Thought.objects.create(
        id=data.get("id") or uuid.uuid4(),
        user=user,
        text=text,
        type=thought_type,
        pinned=bool(data.get("pinned", False)),
        completed=bool(data.get("completed", False)),
        created_at=data.get("created_at") or timezone.now(),
    )


def enqueue_analysis(*, thought: Thought, user=None) -> AnalysisJob:
    """Queue an analysis without changing the original thought content."""
    return AnalysisJob.objects.create(id=uuid.uuid4(), thought=thought, user=user)


@transaction.atomic
def process_analysis_job(job: AnalysisJob) -> AnalysisJob:
    """Process one queued job and persist either its result or its failure."""
    thought = job.thought
    job.status = AnalysisJob.Status.PROCESSING
    job.started_at = timezone.now()
    job.attempts += 1
    job.error_message = ""
    job.save(update_fields=["status", "started_at", "attempts", "error_message"])

    try:
        result = analyze_thought(thought)
        Analysis.objects.create(
            thought=thought,
            user=job.user,
            status=Analysis.Status.COMPLETED,
            summary=result["summary"],
            explanation=result["explanation"],
            key_points=result["key_points"],
            contexts=result["contexts"],
            related_concepts=result["related_concepts"],
            related_notes=result["related_notes"],
            sources=result["sources"],
            images=result["images"],
            model=result["model"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            cost_usd=result["cost_usd"],
            completed_at=timezone.now(),
        )
        thought.context_status = "needs-selection" if result["ambiguous"] and not thought.selected_context else "not-checked"
        thought.save(update_fields=["context_status", "updated_at"])
        job.status = AnalysisJob.Status.COMPLETED
        job.completed_at = timezone.now()
    except Exception as error:  # The job record must retain provider failures for the UI.
        job.status = AnalysisJob.Status.FAILED
        job.error_message = str(error)
        job.completed_at = timezone.now()

    job.save(update_fields=["status", "error_message", "completed_at"])
    return job
