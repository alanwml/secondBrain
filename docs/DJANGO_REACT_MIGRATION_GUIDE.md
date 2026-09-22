# Django + React Migration Guide

## Purpose

This guide describes how to migrate Second Brain from its current local Node.js application to a Python and Django backend with a React frontend.

The migration should preserve the existing product behavior while making the codebase easier to understand, extend, and maintain without requiring AI assistance for every change.

This is a planning document only. It does not implement the migration.

## Target technology stack

```text
Frontend:       React + TypeScript + Vite
Backend:        Python + Django + Django REST Framework
Database:       SQLite during local development
                PostgreSQL when deployed
AI integration: OpenAI Python SDK
Jobs:           Django management command first, task queue later
Graph UI:       React visualization library, added after core migration
Testing:        Django TestCase + API tests + React Testing Library
```

### Why TypeScript is included

The requested frontend is React. TypeScript should be used from the beginning because this application has several related but distinct data shapes:

- A thought
- An AI analysis
- An analysis job
- A connection between notes
- A graph node
- A graph edge

Typed data structures make it easier to discover what a value contains and reduce accidental mismatches between Django responses and React components.

If TypeScript feels like too much at first, the same architecture can use JavaScript. The conventions in this document still apply.

## Target architecture

```text
React browser application
        │
        │ JSON over HTTP
        ▼
Django REST API
        │
        ├── Django models
        ├── Authentication
        ├── AI analysis service
        └── Analysis job service
                │
                ├── SQLite locally
                └── PostgreSQL later
```

The frontend and backend should have clear responsibilities:

### React is responsible for

- Displaying the application interface.
- Managing temporary interface state, such as an open modal.
- Sending requests to the API.
- Rendering loading, success, empty, and error states.
- Drawing the future note graph.
- Formatting data for display.

### Django is responsible for

- Storing thoughts, analyses, jobs, and future note connections.
- Validating incoming data.
- Enforcing authentication and ownership.
- Calling the AI provider.
- Running analysis jobs.
- Returning consistent JSON responses.
- Keeping business rules out of the React components.

React should not read or write database files directly. Django should not return HTML fragments that React must parse.

## Recommended repository layout

The repository should eventually look like this:

```text
secondBrain/
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── config/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── asgi.py
│   │   └── wsgi.py
│   ├── thoughts/
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── urls.py
│   │   ├── views.py
│   │   ├── services.py
│   │   ├── selectors.py
│   │   ├── tests/
│   │   └── migrations/
│   ├── analysis/
│   │   ├── admin.py
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── urls.py
│   │   ├── views.py
│   │   ├── services.py
│   │   ├── tasks.py
│   │   └── tests/
│   └── manage.py
├── frontend/
│   ├── package.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── types/
│   │   └── styles/
│   └── tests/
├── docs/
├── data-migration/
└── README.md
```

The exact folders may change, but backend and frontend code should remain visibly separate.

## Code organization rules

These rules are intended to make the project understandable for a person reading it months later.

### Keep views thin

A Django view should handle HTTP concerns:

1. Read the request.
2. Validate or deserialize input.
3. Call a service or selector.
4. Return a response.

It should not contain long AI prompts, file manipulation, graph algorithms, or complex business decisions.

### Use services for actions

Use a service when an operation changes data or coordinates several steps.

Examples:

- `create_thought`
- `request_analysis`
- `choose_analysis_context`
- `create_note_connection`

Service functions should have descriptive names and should do one meaningful job.

### Use selectors for reads

Use selectors for reusable database queries.

Examples:

- `get_user_thoughts`
- `get_thought_detail`
- `get_connections_for_thought`
- `get_graph_neighborhood`

This keeps query logic out of views and makes it easier to test.

### Keep AI code isolated

The OpenAI request should live in a small service such as `analysis/providers/openai_provider.py` or `analysis/services.py`.

The rest of the application should work with a simple internal result object. It should not need to know the exact provider response format.

### Prefer explicit names

Use:

```python
analysis_job = AnalysisJob.objects.get(id=job_id)
```

instead of:

```python
j = Job.objects.get(id=job_id)
```

Readable names are more valuable than short code in this project.

### Comments should explain decisions

Good comment:

```python
# We save the thought before creating the AI job so the user never loses
# the original note if the external provider is unavailable.
```

Avoid comments that merely repeat the code:

```python
# Create a thought
thought = Thought.objects.create(...)
```

### Keep comments current

Every comment must remain accurate after a future change. If the code is obvious, prefer a clear function name over a comment.

## Domain model

The first Django migration should model the current application cleanly rather than reproducing the JSON structure exactly.

### Thought

Recommended fields:

```text
id
user
text
type
pinned
completed
selected_context
context_status
created_at
updated_at
```

`type` should be restricted to `note`, `task`, and `idea`.

### AI analysis

Keep generated analysis separate from the original thought:

```text
id
thought
user
status
summary
explanation
key_points
contexts
related_concepts
related_notes
sources
images
model
input_tokens
output_tokens
cost_usd
error_message
created_at
completed_at
```

Structured fields can initially use JSON columns. If a field becomes important for filtering or reporting, it can later become a normalized table.

### Analysis job

```text
id
thought
user
status
attempts
started_at
completed_at
error_message
created_at
```

Job status should use explicit values such as `queued`, `processing`, `completed`, and `failed`.

### Future note connection

The note graph should be represented as its own model:

```text
id
user
source_thought
target_thought
relationship_type
description
origin
status
confidence
created_at
updated_at
```

This model is described in detail in [`NOTE_CONNECTIONS_DESIGN.md`](NOTE_CONNECTIONS_DESIGN.md). It should be added after the core migration is stable, not mixed into the first rewrite unless the graph feature is needed immediately.

## API design

The API should use predictable resource-based URLs.

### Thoughts

```text
GET    /api/thoughts/
POST   /api/thoughts/
GET    /api/thoughts/<id>/
PATCH  /api/thoughts/<id>/
DELETE /api/thoughts/<id>/
```

### Analysis

```text
POST   /api/thoughts/<id>/analysis/
GET    /api/thoughts/<id>/analysis/
POST   /api/thoughts/<id>/analysis/context/
```

### Future connections

```text
GET    /api/thoughts/<id>/connections/
POST   /api/thoughts/<id>/connections/
PATCH  /api/connections/<id>/
DELETE /api/connections/<id>/
GET    /api/graph/?focus=<id>&depth=1
```

### API response conventions

Successful responses should return predictable JSON. Errors should use a consistent shape:

```json
{
  "error": {
    "code": "invalid_input",
    "message": "Text is required.",
    "fields": {
      "text": ["This field is required."]
    }
  }
}
```

The frontend should display a friendly message while logging the technical details in development mode.

## React architecture

### Component responsibilities

Components should be small and focused:

```text
App
├── AppShell
├── Sidebar
├── CaptureForm
├── ThoughtFilters
├── ThoughtList
│   └── ThoughtCard
├── ThoughtDetailModal
│   ├── AnalysisPanel
│   └── ConnectionsPanel
└── ToastRegion
```

Avoid putting the whole application in `App.tsx`.

### Feature folders

Organize user-facing behavior by feature rather than by file type alone:

```text
src/features/thoughts/
├── ThoughtList.tsx
├── ThoughtCard.tsx
├── thoughtApi.ts
├── thoughtTypes.ts
└── useThoughts.ts

src/features/analysis/
├── AnalysisPanel.tsx
├── ConfirmAnalysisModal.tsx
├── analysisApi.ts
└── analysisTypes.ts

src/features/graph/
├── GraphView.tsx
├── GraphFilters.tsx
├── graphApi.ts
└── graphTypes.ts
```

### API calls should not be scattered through components

React components should call hooks or feature API modules, not construct fetch requests everywhere.

Preferred flow:

```text
Component → hook → feature API function → Django endpoint
```

This makes it possible to update an endpoint in one place.

### State management

Start with React state and feature hooks. Do not add a global state library until the application demonstrates a real need.

Use local component state for:

- Open or closed modals
- Text input
- Current filters
- Selected graph node

Use a shared data-fetching layer for:

- The current thought list
- Analysis status
- Connection data

## AI analysis migration

The current Node worker should not be copied line by line into Django. Rebuild it around clear responsibilities:

```text
analysis job creator
        ↓
analysis worker
        ↓
provider adapter
        ↓
validated analysis result
        ↓
database update
```

### Provider adapter

Create a small interface such as:

```text
analyze_thought(thought_text, thought_type, context) -> AnalysisResult
```

The OpenAI-specific implementation should be the only place that knows:

- The provider API URL.
- The model name.
- The provider request format.
- The provider response format.
- Web-search tool details.

### Job behavior

The analysis job should:

1. Load the thought.
2. Mark the job as processing.
3. Call the provider adapter.
4. Validate the returned structure.
5. Save the analysis.
6. Mark the job completed.
7. Record a useful error and retry state when something fails.

The job must not overwrite the original thought text.

### First implementation of jobs

For local development, begin with a Django management command that processes queued jobs:

```text
python manage.py process_analysis_jobs
```

This is easy to inspect and debug. A later production phase can run the same job function through a proper queue worker without changing the analysis business logic.

## Migration phases

### Phase 1: freeze and document current behavior

Before changing code:

1. Record the current user flows.
2. Export the existing JSON data.
3. Make a copy of the current working MVP.
4. List the API behavior currently used by `app.js`.
5. Decide which behavior must remain identical.

The current app should remain runnable while the new stack is developed.

### Phase 2: create the Django backend skeleton

Create:

- Python virtual environment.
- Django project.
- `thoughts` app.
- `analysis` app.
- Django REST Framework.
- Environment configuration.
- Initial health-check endpoint.
- Automated test configuration.

At the end of this phase, Django should start successfully and expose a documented health endpoint.

### Phase 3: implement the database models

Implement Thought, AIAnalysis, and AnalysisJob models.

Then:

1. Generate migrations.
2. Apply migrations to SQLite.
3. Register models in Django admin.
4. Add model tests.
5. Verify ownership fields are present from the beginning.

### Phase 4: migrate existing JSON data

Write a one-time import command, for example:

```text
python manage.py import_legacy_json ../data
```

The importer should:

- Read the existing files.
- Preserve original IDs where valid.
- Preserve timestamps.
- Preserve analysis results.
- Convert old status names to the new choices.
- Report skipped or invalid records.
- Be safe to run in dry-run mode.
- Never delete the source JSON files.

The importer should be a script with clear comments because it may need to be run again during development.

### Phase 5: implement the Django API

Add read and write endpoints for thoughts. Then add analysis status and context-selection endpoints.

Each endpoint should have:

- Serializer validation.
- Permission checks.
- A focused view.
- A service or selector where appropriate.
- Tests for success and failure cases.

### Phase 6: create the React frontend

Create the React application with Vite and TypeScript.

Rebuild the interface feature by feature:

1. Application shell.
2. Thought capture.
3. Thought list.
4. Filters and search.
5. Pinning and task completion.
6. Thought detail view.
7. AI analysis confirmation flow.
8. Analysis result display.
9. Context selection.

Do not build the graph during the initial frontend migration. First make sure the existing product works through the new API.

### Phase 7: switch local development to Django + React

Run two development processes:

```text
Terminal 1: Django API
Terminal 2: React development server
```

Configure the React development server to proxy `/api` requests to Django. This avoids hard-coding different API URLs throughout the components.

### Phase 8: add note connections

Once the migrated app is stable:

1. Add the NoteConnection model.
2. Add manual connection endpoints.
3. Add the Connections panel to the note detail view.
4. Add focused graph rendering.
5. Add AI suggestions later.

Follow the separate [note connections design](NOTE_CONNECTIONS_DESIGN.md) for this feature.

## Local development workflow

The README should eventually document these commands clearly:

```text
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

# Frontend, in a second terminal
cd frontend
npm install
npm run dev
```

The actual command names may change, but a new developer should be able to start the project by following the README without inspecting source files.

## Testing strategy

### Backend tests

Test:

- Model validation.
- Thought creation and editing.
- Search and filtering.
- Analysis job transitions.
- Context selection.
- Ownership and permission boundaries.
- JSON import and dry-run behavior.
- Connection creation and deletion once that feature begins.

### Frontend tests

Test:

- Capture form validation.
- Thought card actions.
- Loading and empty states.
- API failure states.
- Confirmation modal behavior.
- Context selection behavior.
- Connections panel behavior.
- Graph controls and selected-node behavior later.

### Manual smoke test

Keep a short checklist in the README:

1. Start both servers.
2. Create a note.
3. Create a task and complete it.
4. Pin and unpin a thought.
5. Search for a thought.
6. Request AI analysis.
7. Confirm that the analysis result appears.
8. Reload the browser.
9. Confirm that data remains available.

## How to make future modifications safely

When changing a feature, follow this sequence:

1. Identify whether the change belongs to the database, API, or frontend.
2. Update the data model and migration if the stored shape changes.
3. Update the serializer and API contract.
4. Update the frontend TypeScript type.
5. Update the API module or hook.
6. Update the relevant component.
7. Add or update tests.
8. Run the smoke test.

### Example: adding a `priority` field to thoughts

The change should be made in this order:

1. Add `priority` to the Django model.
2. Create and apply a migration.
3. Add validation and serialization rules.
4. Update the API response documentation.
5. Add `priority` to the React `Thought` type.
6. Add the control to `ThoughtCard` or the edit form.
7. Add backend and frontend tests.

Avoid adding a field only to the React object. The browser is not the source of truth.

### Example: changing AI behavior

1. Update the provider adapter or prompt configuration.
2. Update the result validation.
3. Preserve backward compatibility when reading old analyses.
4. Add a test case showing the expected structured result.
5. Verify that a failed provider response leaves the original thought untouched.

### Example: changing the graph

1. Confirm whether the change is visual only or changes graph data.
2. Keep graph layout code in the graph feature folder.
3. Keep connection persistence in Django services and models.
4. Use explicit types for graph nodes and edges.
5. Test the empty graph, one-edge graph, and multi-hop graph.

## Documentation standards

Every major feature should have a short document containing:

- Purpose.
- User behavior.
- Data model.
- API endpoints.
- Main files.
- Test checklist.
- Known limitations.

Keep the root README focused on how to run and understand the system. Keep detailed design decisions in `docs/`.

## Things to avoid

- Putting database queries directly in React.
- Putting long AI prompts directly inside Django views.
- Making React components responsible for authentication rules.
- Creating a global state library before it is needed.
- Copying the old Node server into one giant Django file.
- Adding the graph before the note and API migration is stable.
- Automatically creating large numbers of AI-generated connections.
- Using comments to compensate for confusing names or oversized functions.
- Deleting the old JSON data before a successful import has been verified.

## Recommended decision

Use Django as a structured backend and React + TypeScript as a separate frontend. Preserve the current product behavior first, migrate the data second, and add the note graph only after the new foundation is working.

The first implementation milestone should be the backend skeleton and a tested JSON importer. That creates a safe foundation without forcing the graph feature or the AI worker rewrite into the same step.
