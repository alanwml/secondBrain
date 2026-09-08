# Second Brain Deployment Guide

Status: planned next milestone

## Objective

Move the Second Brain from a local-only prototype to a hosted, multi-user application where users can access their notes from anywhere and keep them synchronized across devices.

## Recommended stack

- **Vercel** — hosts the webpage
- **Supabase Auth** — handles sign-up, login, password reset, and sessions
- **Supabase PostgreSQL** — stores user thoughts
- **Supabase Row Level Security** — ensures users can only access their own thoughts

## Proposed database table

```sql
create table public.thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  type text not null check (type in ('note', 'task', 'idea')),
  pinned boolean not null default false,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
```

## Required security policies

```sql
alter table public.thoughts enable row level security;

create policy "Users can view their own thoughts"
on public.thoughts
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create their own thoughts"
on public.thoughts
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own thoughts"
on public.thoughts
for update
to authenticated
using (auth.uid() = user_id);

create policy "Users can delete their own thoughts"
on public.thoughts
for delete
to authenticated
using (auth.uid() = user_id);
```

## Application changes required

1. Add sign-up and login screens.
2. Add logout functionality.
3. Connect the frontend to Supabase.
4. Load thoughts from Supabase instead of `localStorage`.
5. Save new thoughts to Supabase.
6. Update and delete thoughts in Supabase.
7. Query only the authenticated user's thoughts.
8. Handle network and authentication errors.
9. Decide whether to migrate existing local thoughts.

## Authentication decision

Start with email and password authentication. Consider magic links or social login later after the core workflow is validated.

## Deployment sequence

1. Create a Supabase project.
2. Create the `thoughts` table.
3. Enable Row Level Security and add the policies above.
4. Add authentication and database code to the application.
5. Test with multiple user accounts locally.
6. Deploy the frontend to Vercel.
7. Add the Vercel URL to Supabase's allowed redirect URLs.
8. Test from multiple devices and accounts.

## Security notes

- The Supabase project URL and publishable key may be used in frontend code.
- Never expose the Supabase `service_role` key in the browser or repository.
- RLS must be enabled before exposing the table to the frontend.
- Every user-owned table should include a `user_id` and matching RLS policies.

## Product milestone

This deployment milestone changes the app from a local prototype into a real multi-user product. AI, teams, payments, and advanced organization should come after cross-device persistence and the daily-use workflow have been validated.
