from django.core.management.base import BaseCommand
from time import sleep

from thoughts.models import AnalysisJob
from thoughts.services import process_analysis_job


class Command(BaseCommand):
    help = "Process queued Second Brain analysis jobs."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=10, help="Maximum number of jobs to process.")
        parser.add_argument("--watch", action="store_true", help="Keep checking for new jobs until interrupted.")
        parser.add_argument("--interval", type=float, default=2.0, help="Seconds to wait between queue checks in watch mode.")

    def handle(self, *args, **options):
        try:
            while True:
                jobs = AnalysisJob.objects.filter(status=AnalysisJob.Status.QUEUED).select_related("thought")[: options["limit"]]
                jobs = list(jobs)
                if not jobs and not options["watch"]:
                    self.stdout.write("No queued analysis jobs.")
                    return

                for job in jobs:
                    self.stdout.write(f"Processing {job.id} for thought {job.thought.id}...")
                    processed = process_analysis_job(job)
                    if processed.status == AnalysisJob.Status.COMPLETED:
                        self.stdout.write(self.style.SUCCESS("Completed."))
                    else:
                        self.stdout.write(self.style.ERROR(f"Failed: {processed.error_message}"))

                if not options["watch"]:
                    return
                sleep(options["interval"])
        except KeyboardInterrupt:
            self.stdout.write("\nStopping analysis worker.")
