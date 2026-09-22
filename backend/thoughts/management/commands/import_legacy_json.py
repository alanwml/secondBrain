import json
import uuid
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from thoughts.models import Analysis, AnalysisJob, Thought


class Command(BaseCommand):
    help = "Import thoughts and analysis jobs from the current local JSON files."

    def add_arguments(self, parser):
        parser.add_argument("data_directory", type=Path)
        parser.add_argument("--dry-run", action="store_true", help="Validate input without writing database records.")

    def handle(self, *args, **options):
        data_directory = options["data_directory"]
        dry_run = options["dry_run"]
        thoughts_path = data_directory / "thoughts.json"
        jobs_path = data_directory / "analysis-jobs.json"

        if not thoughts_path.exists():
            raise CommandError(f"Missing file: {thoughts_path}")

        thoughts_data = self._read_json(thoughts_path)
        jobs_data = self._read_json(jobs_path) if jobs_path.exists() else []
        imported_thoughts = 0
        imported_jobs = 0

        for raw_thought in thoughts_data:
            thought_id = self._uuid(raw_thought.get("id"))
            if dry_run:
                imported_thoughts += 1
                continue

            thought, _ = Thought.objects.update_or_create(
                id=thought_id,
                defaults={
                    "text": raw_thought.get("text", "").strip(),
                    "type": raw_thought.get("type", Thought.ThoughtType.NOTE),
                    "pinned": bool(raw_thought.get("pinned", False)),
                    "completed": bool(raw_thought.get("completed", False)),
                    "selected_context": raw_thought.get("selectedContext"),
                    "context_status": raw_thought.get("contextStatus", Thought.ContextStatus.NOT_CHECKED),
                    "context_decision_made": bool(raw_thought.get("selectedContext")) or raw_thought.get("contextStatus") == Thought.ContextStatus.UNRESOLVED,
                    "created_at": parse_datetime(raw_thought.get("createdAt")) if raw_thought.get("createdAt") else timezone.now(),
                },
            )
            self._import_analysis(thought, raw_thought.get("aiAnalysis"))
            imported_thoughts += 1

        for raw_job in jobs_data:
            if dry_run:
                imported_jobs += 1
                continue
            try:
                thought = Thought.objects.get(id=self._uuid(raw_job.get("thoughtId")))
            except Thought.DoesNotExist:
                self.stdout.write(self.style.WARNING(f"Skipped job for unknown thought: {raw_job.get('thoughtId')}"))
                continue
            AnalysisJob.objects.update_or_create(
                id=self._uuid(raw_job.get("id")),
                defaults={
                    "thought": thought,
                    "status": raw_job.get("status", AnalysisJob.Status.QUEUED),
                    "attempts": raw_job.get("attempts", 0),
                    "started_at": parse_datetime(raw_job.get("startedAt")) if raw_job.get("startedAt") else None,
                    "completed_at": parse_datetime(raw_job.get("completedAt")) if raw_job.get("completedAt") else None,
                },
            )
            imported_jobs += 1

        mode = "Would import" if dry_run else "Imported"
        self.stdout.write(self.style.SUCCESS(f"{mode} {imported_thoughts} thoughts and {imported_jobs} analysis jobs."))

    @staticmethod
    def _read_json(path: Path):
        try:
            return json.loads(path.read_text())
        except (OSError, json.JSONDecodeError) as error:
            raise CommandError(f"Could not read {path}: {error}") from error

    @staticmethod
    def _uuid(value):
        try:
            return uuid.UUID(str(value))
        except (ValueError, TypeError, AttributeError) as error:
            raise CommandError(f"Invalid UUID in legacy data: {value}") from error

    @staticmethod
    def _import_analysis(thought, raw_analysis):
        if not raw_analysis:
            return
        Analysis.objects.update_or_create(
            thought=thought,
            defaults={
                "status": Analysis.Status.COMPLETED,
                "summary": raw_analysis.get("summary", ""),
                "explanation": raw_analysis.get("explanation", ""),
                "key_points": raw_analysis.get("keyPoints", []),
                "contexts": raw_analysis.get("contexts", []),
                "related_concepts": raw_analysis.get("relatedConcepts", []),
                "related_notes": raw_analysis.get("relatedNotes", []),
                "sources": raw_analysis.get("sources", []),
                "images": raw_analysis.get("images", []),
                "model": raw_analysis.get("model", ""),
                "input_tokens": raw_analysis.get("inputTokens"),
                "output_tokens": raw_analysis.get("outputTokens"),
                "cost_usd": raw_analysis.get("costUsd"),
                "completed_at": parse_datetime(raw_analysis.get("completedAt")) if raw_analysis.get("completedAt") else None,
            },
        )
