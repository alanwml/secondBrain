import uuid

from django.utils import timezone

from .models import AnalysisJob, Thought


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
