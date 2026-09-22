#!/usr/bin/env python3
"""Start the Django API and React development server together.

Run from the project root with:

    python3 dev.py

The launcher keeps the two processes separate internally, but gives the
developer one command and one place to stop the local application.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV_PYTHON = BACKEND / ".venv" / "bin" / "python"


def stream_output(label: str, process: subprocess.Popen[str]) -> None:
    """Forward a child process's output with a readable service prefix."""
    assert process.stdout is not None
    for line in process.stdout:
        print(f"[{label}] {line}", end="")


def start_process(label: str, command: list[str], working_directory: Path) -> subprocess.Popen[str]:
    """Start one development service in its own process group."""
    process = subprocess.Popen(
        command,
        cwd=working_directory,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        start_new_session=(os.name != "nt"),
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    )
    threading.Thread(target=stream_output, args=(label, process), daemon=True).start()
    return process


def stop_process(process: subprocess.Popen[str]) -> None:
    """Stop a service and its child processes without leaving Vite running."""
    if process.poll() is not None:
        return

    try:
        if os.name == "nt":
            process.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=5)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        process.kill()


def main() -> int:
    if not BACKEND.exists() or not FRONTEND.exists():
        print("Could not find both backend/ and frontend/ directories.", file=sys.stderr)
        return 1

    if not VENV_PYTHON.exists():
        print("Backend virtual environment not found.", file=sys.stderr)
        print("Run the setup commands in README.md first.", file=sys.stderr)
        return 1

    processes: list[subprocess.Popen[str]] = []
    try:
        print("Starting Second Brain...", flush=True)
        processes.append(start_process("Django", [str(VENV_PYTHON), "manage.py", "runserver", "127.0.0.1:8000", "--noreload"], BACKEND))
        processes.append(start_process("React", ["npm", "run", "dev"], FRONTEND))
        processes.append(start_process("Worker", [str(VENV_PYTHON), "manage.py", "process_analysis_jobs", "--watch"], BACKEND))
        print("Open http://localhost:5173 in your browser.", flush=True)
        print("Press Ctrl+C to stop Django, React, and the AI worker.", flush=True)

        while True:
            for process in processes:
                exit_code = process.poll()
                if exit_code is not None:
                    return exit_code
            time.sleep(0.2)
    except KeyboardInterrupt:
        print("\nStopping Second Brain...", flush=True)
        return 0
    finally:
        for process in reversed(processes):
            stop_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
