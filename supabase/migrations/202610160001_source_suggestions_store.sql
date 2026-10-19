-- RBHQ Phase 1: move source suggestions from process-local SQLite into the
-- shared, channel-scoped store used by API and clip workers.
begin;

create table if not exists public.source_suggestions (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete restrict,
  operator_id uuid not null references public.users(id) on delete restrict,
  source_url text not null,
  source_title text not null,
  source_author text,
  duration_seconds double precision check (duration_seconds is null or duration_seconds >= 0),
  thumbnail_url text,
  initial_score double precision not null default 0
    check (initial_score >= 0 and initial_score <= 100),
  reasoning jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'suggested'
    check (status in ('suggested', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists source_suggestions_channel_created_at_idx
  on public.source_suggestions (channel_id, created_at desc);

alter table public.source_suggestions enable row level security;
alter table public.source_suggestions force row level security;

revoke all on public.source_suggestions from anon;
grant select, insert, update, delete on public.source_suggestions to authenticated, service_role;

drop policy if exists rbhq_authenticated_gate on public.source_suggestions;
drop policy if exists rbhq_channel_isolation on public.source_suggestions;

create policy rbhq_authenticated_gate on public.source_suggestions
  as permissive for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

create policy rbhq_channel_isolation on public.source_suggestions
  as restrictive for all to authenticated
  using ((select private.rbhq_can_access_channel(channel_id)))
  with check ((select private.rbhq_can_access_channel(channel_id)));

commit;
