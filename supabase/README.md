# Supabase Stage 1 setup

1. Create a project at [supabase.com](https://supabase.com/).
2. Open the project's SQL Editor.
3. Paste and run [`schema.sql`](schema.sql).
4. In the project settings, copy the project URL and browser-safe publishable/anon key.
5. Copy `supabase-config.example.js` to `supabase-config.js` in the project root.
6. Replace the placeholders in `supabase-config.js`.
7. Configure the hosted site's URL as an Auth redirect URL in Supabase.
8. Run the local server and test account creation, sign-in, note creation, and note deletion.

```bash
cp supabase-config.example.js supabase-config.js
node server.js
```

The configuration file is ignored by Git. Never put a Supabase secret/service-role key in it. Stage 1 uses the browser-safe key with Row Level Security; the AI worker and secret provider key will be added in the hosted Edge Function stage.

## Current scope

Stage 1 provides:

- Authenticated users
- Per-user thoughts
- Per-user analysis records
- Per-user analysis jobs
- RLS policies for user-owned rows
- Local-mode fallback when Supabase is not configured

The hosted analysis worker is intentionally not enabled by this schema alone. Until the Edge Function is deployed, hosted AI jobs remain queued. The existing local `server.js` AI worker remains available for local development.
