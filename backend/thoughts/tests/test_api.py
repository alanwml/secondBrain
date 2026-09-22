import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from thoughts.models import Analysis, AnalysisJob, Thought


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
