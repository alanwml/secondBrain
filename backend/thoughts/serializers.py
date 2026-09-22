from rest_framework import serializers

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

    class Meta:
        model = Thought
        fields = [
            "id", "text", "type", "pinned", "completed", "selected_context",
            "context_status", "created_at", "updated_at", "latest_analysis", "analysis_status",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "latest_analysis", "analysis_status"]

    def get_latest_analysis(self, thought):
        analysis = thought.analyses.filter(status=Analysis.Status.COMPLETED).first()
        return AnalysisSerializer(analysis).data if analysis else None

    def get_analysis_status(self, thought):
        job = thought.analysis_jobs.first()
        if job:
            return job.status
        return "completed" if thought.analyses.exists() else "none"
