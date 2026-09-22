from rest_framework import serializers
from django.db.models import Count, Sum

from .models import Analysis, AnalysisJob, Thought


class AnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = Analysis
        fields = [
            "id", "status", "summary", "explanation", "key_points", "contexts",
            "related_concepts", "related_notes", "sources", "images", "model",
            "input_tokens", "output_tokens", "cost_usd", "error_message", "created_at",
            "completed_at",
        ]


class AnalysisJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnalysisJob
        fields = ["id", "status", "attempts", "error_message", "created_at", "started_at", "completed_at"]


class ThoughtSerializer(serializers.ModelSerializer):
    latest_analysis = serializers.SerializerMethodField()
    analysis_status = serializers.SerializerMethodField()
    analysis_error = serializers.SerializerMethodField()
    analysis_runs = serializers.SerializerMethodField()
    total_input_tokens = serializers.SerializerMethodField()
    total_output_tokens = serializers.SerializerMethodField()
    total_cost_usd = serializers.SerializerMethodField()

    class Meta:
        model = Thought
        fields = [
            "id", "text", "type", "pinned", "completed", "selected_context",
            "context_status", "context_decision_made", "created_at", "updated_at", "latest_analysis", "analysis_status", "analysis_error",
            "analysis_runs", "total_input_tokens", "total_output_tokens", "total_cost_usd",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "latest_analysis", "analysis_status", "analysis_error"]

    def get_latest_analysis(self, thought):
        analysis = thought.analyses.filter(status=Analysis.Status.COMPLETED).first()
        return AnalysisSerializer(analysis).data if analysis else None

    def get_analysis_status(self, thought):
        job = thought.analysis_jobs.order_by("-created_at").first()
        if job and job.status in {"queued", "processing", "failed"}:
            return job.status
        return "completed" if thought.analyses.filter(status=Analysis.Status.COMPLETED).exists() else "none"

    def get_analysis_error(self, thought):
        job = thought.analysis_jobs.order_by("-created_at").first()
        return job.error_message if job and job.status == "failed" else ""

    def _analysis_totals(self, thought):
        return thought.analyses.aggregate(
            runs=Count("id"),
            input_tokens=Sum("input_tokens"),
            output_tokens=Sum("output_tokens"),
            cost_usd=Sum("cost_usd"),
        )

    def get_analysis_runs(self, thought):
        return self._analysis_totals(thought)["runs"] or 0

    def get_total_input_tokens(self, thought):
        return self._analysis_totals(thought)["input_tokens"] or 0

    def get_total_output_tokens(self, thought):
        return self._analysis_totals(thought)["output_tokens"] or 0

    def get_total_cost_usd(self, thought):
        total = self._analysis_totals(thought)["cost_usd"]
        return f"{total:.6f}" if total is not None else "0.000000"
