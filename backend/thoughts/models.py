from django.conf import settings
from django.db import models


class Thought(models.Model):
    class ThoughtType(models.TextChoices):
        NOTE = "note", "Note"
        TASK = "task", "Task"
        IDEA = "idea", "Idea"

    class ContextStatus(models.TextChoices):
        NOT_CHECKED = "not-checked", "Not checked"
        NEEDS_SELECTION = "needs-selection", "Needs selection"
        RESOLVED = "resolved", "Resolved"
        UNRESOLVED = "unresolved", "Unresolved"

    id = models.UUIDField(primary_key=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True)
    text = models.TextField()
    type = models.CharField(max_length=20, choices=ThoughtType.choices, default=ThoughtType.NOTE)
    pinned = models.BooleanField(default=False)
    completed = models.BooleanField(default=False)
    selected_context = models.CharField(max_length=255, blank=True, null=True)
    context_status = models.CharField(max_length=30, choices=ContextStatus.choices, default=ContextStatus.NOT_CHECKED)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.text[:80]


class Analysis(models.Model):
    class Status(models.TextChoices):
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.BigAutoField(primary_key=True)
    thought = models.ForeignKey(Thought, on_delete=models.CASCADE, related_name="analyses")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.COMPLETED)
    summary = models.TextField(blank=True)
    explanation = models.TextField(blank=True)
    key_points = models.JSONField(default=list, blank=True)
    contexts = models.JSONField(default=list, blank=True)
    related_concepts = models.JSONField(default=list, blank=True)
    related_notes = models.JSONField(default=list, blank=True)
    sources = models.JSONField(default=list, blank=True)
    images = models.JSONField(default=list, blank=True)
    model = models.CharField(max_length=120, blank=True)
    input_tokens = models.IntegerField(null=True, blank=True)
    output_tokens = models.IntegerField(null=True, blank=True)
    cost_usd = models.DecimalField(max_digits=12, decimal_places=6, null=True, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class AnalysisJob(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, editable=False)
    thought = models.ForeignKey(Thought, on_delete=models.CASCADE, related_name="analysis_jobs")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    attempts = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
