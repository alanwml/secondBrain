# Second Brain

A calm, local-first second brain for capturing and retrieving the thoughts, tasks, and ideas that matter.

## Current MVP

- Capture notes, tasks, and ideas in one quick input
- Search and sort your thoughts
- Filter by all thoughts, inbox, tasks, or pinned items
- Pin important thoughts and mark tasks complete
- Data persists in the browser with `localStorage`
- No account, server, or build step required

## Run it

For the basic offline prototype, open `index.html` in a browser. For the AI-backed local version, create a `.env` file in the project folder:

```env
OPENAI_API_KEY=your_api_key_here
AI_MODEL=gpt-5.5
```

Then run the local server:

```bash
node server.js
```

Then visit http://localhost:8000.

The server stores local notes and queued analysis jobs in `data/`, which is intentionally ignored by Git. `.env` is also ignored by Git. Do not commit your API key or paste it into browser storage. If the repository is ever made public, verify that `.env` is not tracked before pushing.

### Local AI configuration

The local worker currently uses the OpenAI Responses API and is structured around an OpenAI-compatible provider boundary:

```bash
OPENAI_API_KEY=your_key_here \
AI_MODEL=gpt-5.5 \
node server.js
```

For an OpenAI-compatible provider, set its API root and model:

```bash
AI_API_KEY=your_key_here \
AI_BASE_URL=https://your-provider.example/v1 \
AI_MODEL=your-model-name \
node server.js
```

The local version supports background jobs, AI status tracking, model/token metadata, source links, and source preview images. The provider adapter is intentionally kept in `server.js` so additional providers can be added without exposing keys in the browser.

### Context-aware analysis

AI analysis now detects ambiguous terms and can suggest multiple meanings. When a note needs context, open it and choose a suggested context, enter a custom context, compare all contexts, or leave the context unresolved. Choosing a context queues a more focused analysis without changing the original note. The analysis can also suggest related concepts and related notes.

## Product direction

The first goal is daily retention, not feature volume. The habit loop is:

1. Capture quickly when something comes to mind.
2. Return to the inbox and clarify what matters.
3. Retrieve thoughts through search and pinned items.
4. Use the app during a short daily review.

The next product milestones should be validated with actual usage: a daily review flow, optional tags/projects, export/backup, then accounts and sync. AI should only be added after there is enough real user data to identify a repeated pain point.
