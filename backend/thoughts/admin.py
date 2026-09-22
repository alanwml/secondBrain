from django.contrib import admin

from .models import Analysis, AnalysisJob, Thought


@admin.register(Thought)
class ThoughtAdmin(admin.ModelAdmin):
    list_display = ("text", "type", "pinned", "completed", "created_at")
    list_filter = ("type", "pinned", "completed", "context_status")
    search_fields = ("text",)


@admin.register(Analysis)
class AnalysisAdmin(admin.ModelAdmin):
    list_display = ("thought", "status", "model", "created_at", "completed_at")
    list_filter = ("status", "model")


@admin.register(AnalysisJob)
class AnalysisJobAdmin(admin.ModelAdmin):
    list_display = ("thought", "status", "attempts", "created_at", "completed_at")
    list_filter = ("status",)
