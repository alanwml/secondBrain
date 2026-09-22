import uuid
from unittest.mock import patch

from django.test import TestCase
from django.core.management import call_command
from rest_framework.test import APIClient

from thoughts.models import Analysis, AnalysisJob, Thought
from thoughts.services import process_analysis_job


class ThoughtApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_check(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_create_and_list_thought(self):
        thought_id = str(uuid.uuid4())
        create_response = self.client.post(
            "/api/thoughts/",
            {"id": thought_id, "text": "Learn Django", "type": "note"},
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.json()["text"], "Learn Django")

        list_response = self.client.get("/api/thoughts/")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()), 1)

    def test_analysis_request_creates_job(self):
        thought = Thought.objects.create(id=uuid.uuid4(), text="A note", created_at="2026-01-01T00:00:00Z")
        response = self.client.post(f"/api/thoughts/{thought.id}/analysis/", {}, format="json")
        self.assertEqual(response.status_code, 202)
        self.assertEqual(AnalysisJob.objects.count(), 1)

    def test_completed_analysis_cannot_be_requested_again(self):
        thought = Thought.objects.create(id=uuid.uuid4(), text="Already analyzed", created_at="2026-01-01T00:00:00Z")
        Analysis.objects.create(thought=thought, status=Analysis.Status.COMPLETED)

        response = self.client.post(f"/api/thoughts/{thought.id}/analysis/", {}, format="json")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(AnalysisJob.objects.count(), 0)

    @patch("thoughts.services.analyze_thought")
    def test_analysis_job_saves_provider_result(self, mock_analyze):
        mock_analyze.return_value = {
            "summary": "A short summary",
            "explanation": "A longer explanation",
            "key_points": ["Point one"],
            "contexts": [],
            "related_concepts": ["Django"],
            "related_notes": [],
            "sources": [],
            "images": [],
            "model": "test-model",
            "input_tokens": 10,
            "output_tokens": 20,
            "cost_usd": 0.001,
            "ambiguous": False,
        }
        thought = Thought.objects.create(id=uuid.uuid4(), text="A note", created_at="2026-01-01T00:00:00Z")
        job = AnalysisJob.objects.create(id=uuid.uuid4(), thought=thought)

        processed = process_analysis_job(job)

        self.assertEqual(processed.status, AnalysisJob.Status.COMPLETED)
        self.assertEqual(Analysis.objects.get(thought=thought).summary, "A short summary")

    def test_context_selection_queues_exactly_one_follow_up_analysis(self):
        initial_thought = Thought.objects.create(id=uuid.uuid4(), text="Vectorisation", created_at="2026-01-01T00:00:00Z")
        Analysis.objects.create(thought=initial_thought, status=Analysis.Status.COMPLETED)

        response = self.client.post(
            f"/api/thoughts/{initial_thought.id}/context/",
            {"context": "machine learning"},
            format="json",
        )

        self.assertEqual(response.status_code, 202)
        initial_thought.refresh_from_db()
        self.assertEqual(initial_thought.selected_context, "machine learning")
        self.assertEqual(initial_thought.context_status, Thought.ContextStatus.RESOLVED)
        self.assertTrue(initial_thought.context_decision_made)
        self.assertEqual(AnalysisJob.objects.filter(thought=initial_thought).count(), 1)

    def test_context_selection_requires_completed_analysis(self):
        thought = Thought.objects.create(id=uuid.uuid4(), text="Vectorisation", created_at="2026-01-01T00:00:00Z")

        response = self.client.post(
            f"/api/thoughts/{thought.id}/context/",
            {"context": "machine learning"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_context_cannot_be_changed_after_one_time_decision(self):
        thought = Thought.objects.create(
            id=uuid.uuid4(),
            text="A note",
            selected_context="Initial context",
            context_status=Thought.ContextStatus.RESOLVED,
            context_decision_made=True,
            created_at="2026-01-01T00:00:00Z",
        )

        response = self.client.post(f"/api/thoughts/{thought.id}/context/", {"context": "Another context"}, format="json")

        self.assertEqual(response.status_code, 409)

    def test_blank_custom_context_is_rejected(self):
        thought = Thought.objects.create(id=uuid.uuid4(), text="A note", created_at="2026-01-01T00:00:00Z")

        response = self.client.post(f"/api/thoughts/{thought.id}/context/", {"context": "   "}, format="json")

        self.assertEqual(response.status_code, 400)

    @patch("thoughts.services.analyze_thought")
    def test_queue_to_completed_analysis_flow(self, mock_analyze):
        mock_analyze.return_value = {
            "summary": "End-to-end summary",
            "explanation": "End-to-end explanation",
            "key_points": [],
            "contexts": [],
            "related_concepts": [],
            "related_notes": [],
            "sources": [],
            "images": [],
            "model": "test-model",
            "input_tokens": 1,
            "output_tokens": 1,
            "cost_usd": 0,
            "ambiguous": False,
        }
        thought = Thought.objects.create(id=uuid.uuid4(), text="End-to-end test", created_at="2026-01-01T00:00:00Z")

        queued_response = self.client.post(f"/api/thoughts/{thought.id}/analysis/", {}, format="json")
        self.assertEqual(queued_response.status_code, 202)

        call_command("process_analysis_jobs")

        completed_response = self.client.get("/api/thoughts/")
        completed_thought = completed_response.json()[0]
        self.assertEqual(completed_thought["analysis_status"], "completed")
        self.assertEqual(completed_thought["latest_analysis"]["summary"], "End-to-end summary")

    def test_analysis_observability_aggregates_multiple_runs(self):
        thought = Thought.objects.create(id=uuid.uuid4(), text="Two analyses", created_at="2026-01-01T00:00:00Z")
        Analysis.objects.create(thought=thought, input_tokens=100, output_tokens=25, cost_usd="0.010000")
        Analysis.objects.create(thought=thought, input_tokens=200, output_tokens=50, cost_usd="0.020000")

        response = self.client.get("/api/thoughts/")
        item = next(value for value in response.json() if value["id"] == str(thought.id))

        self.assertEqual(item["analysis_runs"], 2)
        self.assertEqual(item["total_input_tokens"], 300)
        self.assertEqual(item["total_output_tokens"], 75)
        self.assertEqual(item["total_cost_usd"], "0.030000")
