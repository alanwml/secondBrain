-- Second Brain hosted Stage 1 schema
-- Run this in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(trim(text)) > 0),
  type text not null check (type in ('note', 'task', 'idea')),
  pinned boolean not null default false,
  completed boolean not null default false,
  ai_status text not null default 'none' check (ai_status in ('none', 'queued', 'processing', 'completed', 'failed')),
  ai_error text,
  selected_context text,
  context_status text not null default 'not-checked' check (context_status in ('not-checked', 'not-needed', 'needs-selection', 'resolved', 'unresolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  thought_id uuid not null unique references public.thoughts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  result jsonb not null default '{}'::jsonb,
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(18, 8),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  thought_id uuid not null references public.thoughts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists thoughts_user_created_idx on public.thoughts(user_id, created_at desc);
create index if not exists analysis_jobs_status_idx on public.analysis_jobs(status, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists thoughts_set_updated_at on public.thoughts;
create trigger thoughts_set_updated_at
before update on public.thoughts
for each row execute function public.set_updated_at();

alter table public.thoughts enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.analysis_jobs enable row level security;

-- Grants are required in addition to RLS policies. RLS filters rows; grants
-- allow the authenticated role to perform the operation at all.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.thoughts to authenticated;
grant select on table public.ai_analyses to authenticated;
grant select, insert, update on table public.analysis_jobs to authenticated;

drop policy if exists "Users can view their own thoughts" on public.thoughts;
create policy "Users can view their own thoughts" on public.thoughts
for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can create their own thoughts" on public.thoughts;
create policy "Users can create their own thoughts" on public.thoughts
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update their own thoughts" on public.thoughts;
create policy "Users can update their own thoughts" on public.thoughts
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own thoughts" on public.thoughts;
create policy "Users can delete their own thoughts" on public.thoughts
for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can view their own analyses" on public.ai_analyses;
create policy "Users can view their own analyses" on public.ai_analyses
for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can view their own jobs" on public.analysis_jobs;
create policy "Users can view their own jobs" on public.analysis_jobs
for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can create their own jobs" on public.analysis_jobs;
create policy "Users can create their own jobs" on public.analysis_jobs
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update their own jobs" on public.analysis_jobs;
create policy "Users can update their own jobs" on public.analysis_jobs
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
