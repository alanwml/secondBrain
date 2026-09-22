# Second Brain

## Executive overview

Second Brain is a calm, personal knowledge workspace for capturing thoughts, tasks, and ideas before they are lost.

The product is designed around a simple daily loop:

1. Capture something quickly.
2. Organize it as a note, task, or idea.
3. Retrieve it through search, filters, and related notes.
4. Use AI to explain, research, and connect ideas when useful.

The long-term product goal is to become a reliable personal knowledge companion that helps people turn scattered thoughts into understandable, connected knowledge. The initial customer goal is to validate daily usage personally, then grow toward approximately 100 customers in the first year.

The current project is a local-first MVP. It already includes AI-assisted analysis, background processing, web sources, source preview images, usage tracking, and context disambiguation for ambiguous terms such as “vectorisation.” The next major milestone is moving from local files to a hosted, multi-user platform.

## Current capabilities

- Capture notes, tasks, and ideas from one input area
- Filter by all thoughts, inbox, tasks, ideas, or pinned items
- Search and sort captured thoughts
- Pin thoughts and complete tasks
- Responsive desktop and mobile layout
- Optional AI analysis for notes and ideas
- Confirmation modal before sending content to AI
- “Don’t ask me again” preference
- Background AI analysis through a local worker
- AI status indicators for queued, processing, completed, and failed states
- AI explanations and key points
- Ambiguity detection with suggested contexts
- Custom context selection or “explain all contexts”
- Related concepts and related existing notes
- Web research sources and source links
- Source preview images when available
- AI model, input tokens, output tokens, and estimated cost metadata
- Local `.env` support for API keys
- Local JSON persistence for thoughts and analysis jobs
- Modal close button outside long-scrolling note content
- Backdrop click and Escape-to-close behavior

## Current status

This is the local MVP checkpoint before hosted deployment.

The current application uses:

- Browser `localStorage` as a fallback for basic offline use
- `data/thoughts.json` for server-backed local persistence
- `data/analysis-jobs.json` for the local analysis queue
- `server.js` as a small local HTTP server and background worker
- OpenAI Responses API or an OpenAI-compatible provider for AI analysis

The application is not yet a production multi-user service. Authentication, cloud database storage, Row Level Security, hosted background jobs, rate limiting, billing, backups, and production monitoring are planned for the next phase.

## Technical architecture today

```text
Browser
  ├── index.html
  ├── styles.css
  └── app.js
        │
        └── Local HTTP API
              └── server.js
                    ├── data/thoughts.json
                    ├── data/analysis-jobs.json
                    └── OpenAI Responses API
                          └── Web search tool
```

### Frontend

The frontend is intentionally built with plain HTML, CSS, and browser JavaScript. There is currently no framework or build step.

Important frontend responsibilities:

- Render navigation, capture form, filters, cards, and modals
- Poll the local API for updated analysis status
- Preserve the original thought separately from AI output
- Display context choices, related concepts, sources, images, and usage metadata
- Fall back to `localStorage` when the local server is unavailable

### Local server

`server.js` uses Node’s built-in modules and does not require an npm dependency install.

It provides:

- Static file serving
- Thought CRUD endpoints
- Analysis job creation
- A persisted local job queue
- OpenAI Responses API integration
- Web search source extraction
- Source preview image discovery through `og:image`
- Token and cost calculation
- AI status and error tracking

### AI analysis flow

```text
User selects “Analyze with AI”
        │
        ├── Confirmation modal
        │
        └── Thought saved immediately
                │
                └── Analysis job queued
                        │
                        └── Local worker processes job
                                │
                                ├── Calls model
                                ├── Detects ambiguity
                                ├── Performs web research
                                ├── Collects sources
                                ├── Finds source preview images
                                ├── Calculates usage/cost
                                └── Saves analysis result
```

### Context-aware analysis

The AI is instructed not to silently choose a meaning when a term is ambiguous. It can return:

- `ambiguous`
- `contexts`
- `relatedConcepts`
- `relatedNotes`
- `explanation`
- `keyPoints`
- `sources`
- `images`

When the user chooses a context, the original note remains unchanged and a new analysis job is queued using the selected context.

## Running locally

### Basic offline mode

Open `index.html` directly in a browser. This mode uses browser `localStorage` and does not provide background AI processing.

### AI-backed local mode

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_api_key_here
AI_MODEL=gpt-5.5
```

Then run:

```bash
node server.js
```

Open:

```text
http://localhost:8000
```

The `.env`, `data/`, and `.vercel/` paths are ignored by Git. Never commit API keys or runtime data containing private notes.

### OpenAI-compatible providers

The local provider boundary supports providers that expose a compatible Responses API:

```env
AI_API_KEY=your_provider_key_here
AI_BASE_URL=https://your-provider.example/v1
AI_MODEL=your-model-name
```

Provider-specific adapters for APIs with different request and response formats, such as Anthropic or Gemini, are planned but are not yet implemented.

## Planned hosted architecture

The recommended production architecture is:

```text
Vercel
  └── Hosted frontend

Supabase
  ├── Auth
  ├── PostgreSQL
  ├── Row Level Security
  ├── Analysis jobs
  └── Edge Functions
        └── AI provider calls
```

The hosted migration will replace:

| Local component | Hosted replacement |
| --- | --- |
| Browser `localStorage` | Supabase PostgreSQL |
| `data/thoughts.json` | `thoughts` table |
| `data/analysis-jobs.json` | `analysis_jobs` table |
| Local `server.js` | Supabase Edge Functions |
| `.env` API key | Secure hosted project secret |
| Local fallback identity | Supabase Auth user identity |

Every user-owned row will include a `user_id`, and Row Level Security will ensure users can only access their own data.

## Planned production database model

### `thoughts`

Stores original user-created content:

```text
id
user_id
text
type
pinned
completed
selected_context
context_status
created_at
updated_at
```

### `ai_analyses`

Stores generated results separately from the original note:

```text
id
thought_id
user_id
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

### `analysis_jobs`

Tracks asynchronous processing:

```text
id
thought_id
user_id
status
attempts
started_at
completed_at
error_message
```

## Security principles

- API keys stay server-side.
- The browser only receives public configuration and authenticated user data.
- Row Level Security protects user-owned rows.
- The `service_role` or equivalent secret key must never be exposed to the browser.
- User-supplied provider keys require encryption and server-only access.
- AI analysis should be opt-in and clearly communicate that note content is sent to an external provider.
- Rate limits and job quotas will be required before onboarding customers.

## Product roadmap

### Phase 1: Hosted foundation

- Supabase project
- Authentication
- Database schema
- RLS policies
- Replace local persistence with cloud persistence

### Phase 2: Hosted AI processing

- Edge Function for analysis
- Persistent analysis jobs
- Retry and failure handling
- Secure AI provider secrets
- Usage and cost dashboard

### Phase 3: Daily-use improvements

- Daily review flow
- Tags and projects
- Better related-note linking
- Export and backup
- Offline-friendly synchronization

### Phase 4: Customer readiness

- Onboarding
- Privacy and data deletion controls
- Rate limiting
- Usage plans and billing
- Product analytics
- Support and operational monitoring

## Product success metrics

The first validation target is personal daily usage for at least one month.

Useful early metrics include:

- Daily active use
- Number of thoughts captured per day
- Percentage of notes revisited
- AI analysis usage rate
- Context-selection rate
- Search usage
- Seven-day and thirty-day retention
- Number of users who return voluntarily

The initial customer goal is approximately 100 customers in the first year, but retention and repeated usefulness should be validated before optimizing for acquisition.

## Checkpoints

- [Pre-context disambiguation](checkpoints/pre-context-disambiguation/)
- [Context-aware analysis with modal fix](checkpoints/context-aware-analysis-modal-fixed/)

## Django + React migration

The `django_version` branch contains the first migration slice toward the new
Python and React architecture. The original Node.js MVP remains at the project
root so it can be used for comparison while the migration is underway.

The new application runs as two local processes:

```text
React/Vite browser app: http://localhost:5173
             │
             └── /api requests ──> Django API: http://127.0.0.1:8000
```

Prerequisites: Python 3.10+, Node.js 20+, and npm. Run these commands from the
project root unless a `cd` command is shown.

### First-time setup and start the new backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py import_legacy_json ../data
python manage.py runserver
```

The virtual environment only needs to be created once. On later days, use
`cd backend && source .venv/bin/activate` before running Django commands.

The importer copies the existing JSON data into `backend/db.sqlite3`. Preview
the import with `python manage.py import_legacy_json ../data --dry-run` before
running the real import. The source JSON files are not modified or deleted.

The backend is available at:

- Health check: http://127.0.0.1:8000/api/health/
- Thought API: http://127.0.0.1:8000/api/thoughts/
- Django admin: http://127.0.0.1:8000/admin/

### Start the new frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser. The React development server
proxies `/api` requests to Django on port 8000.

### Normal daily startup

After the first-time setup, start the complete local application with one
command from the project root:

```bash
python3 dev.py
```

Then open http://localhost:5173. Press `Ctrl+C` to stop both Django and React.

The launcher starts three processes internally—Django, React, and the AI
worker—but you only need one terminal.
If you prefer to run them separately for debugging, use the commands below.

Terminal 1:

```bash
cd backend
source .venv/bin/activate
python manage.py runserver
```

Terminal 2:

```bash
cd frontend
npm run dev
```

### Verification commands

```bash
cd backend
source .venv/bin/activate
python manage.py check
python manage.py test

cd ../frontend
npm run build
```

If the frontend shows an API error, confirm that Django is running and test it
with `curl http://127.0.0.1:8000/api/health/`. If the database has no thoughts,
run `python manage.py import_legacy_json ../data` from the `backend` directory.

The migration guide in [`docs/DJANGO_REACT_MIGRATION_GUIDE.md`](docs/DJANGO_REACT_MIGRATION_GUIDE.md)
describes the architecture and the remaining migration phases.

### Run AI analysis jobs

The Django backend now includes the AI provider integration and a readable
management-command worker. It accepts the existing root `.env` configuration
or a separate `backend/.env` file.

With the backend virtual environment active:

```bash
cd backend
source .venv/bin/activate
python manage.py process_analysis_jobs
```

Use `--limit 1` to process one job while debugging. The worker updates the
job and analysis records, and the React interface polls active jobs so the
status changes without a page refresh.
