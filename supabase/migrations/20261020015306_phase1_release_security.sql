-- RBHQ Phase 1 release hardening.
-- Runs after the already-applied anonymous containment migration and after the
-- pending channel-isolation migrations when production is deployed with
-- `supabase db push --include-all`.
begin;

-- The application and worker both emit best-effort publish audit events, but
-- the production baseline never created their target relation. Add the
-- missing audit store before applying the channel policy and release gate.
create table if not exists public.publish_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  event_type text not null,
  payload jsonb,
  success boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists publish_events_post_id_created_at_idx
  on public.publish_events (post_id, created_at desc);
create index if not exists publish_events_event_type_created_at_idx
  on public.publish_events (event_type, created_at desc);

alter table public.publish_events enable row level security;
alter table public.publish_events force row level security;
revoke all privileges on public.publish_events from anon;
grant select, insert, update, delete on public.publish_events to authenticated, service_role;

drop policy if exists rbhq_authenticated_gate on public.publish_events;
create policy rbhq_authenticated_gate on public.publish_events
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists rbhq_post_channel_isolation on public.publish_events;
create policy rbhq_post_channel_isolation on public.publish_events
  as restrictive
  for all
  to authenticated
  using (
    (select private.rbhq_is_super_admin()) or exists (
      select 1
      from public.posts as owner_post
      where owner_post.id = publish_events.post_id
        and (select private.rbhq_can_access_channel(owner_post.channel_id))
    )
  )
  with check (
    (select private.rbhq_is_super_admin()) or exists (
      select 1
      from public.posts as owner_post
      where owner_post.id = publish_events.post_id
        and (select private.rbhq_can_access_channel(owner_post.channel_id))
    )
  );

create or replace function public.refresh_clip_source_counts(target_source_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if target_source_id is null then
    return;
  end if;

  update public.clip_sources
  set
    pending_count = counts.pending_count,
    approved_count = counts.approved_count,
    rejected_count = counts.rejected_count,
    manually_published_count = counts.manually_published_count,
    total_imported = counts.total_imported,
    last_ingested_at = counts.last_ingested_at
  from (
    select
      count(*) filter (where status = 'pending')::integer as pending_count,
      count(*) filter (where status = 'approved')::integer as approved_count,
      count(*) filter (where status = 'rejected')::integer as rejected_count,
      count(*) filter (where publish_status = 'manually_published')::integer as manually_published_count,
      count(*)::integer as total_imported,
      max(ingested_at) as last_ingested_at
    from public.clips
    where source_id = target_source_id
  ) as counts
  where public.clip_sources.id = target_source_id;
end;
$function$;

create or replace function public.refresh_clip_source_counts_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  perform public.refresh_clip_source_counts(coalesce(new.source_id, old.source_id));

  if tg_op = 'UPDATE' and old.source_id is distinct from new.source_id then
    perform public.refresh_clip_source_counts(old.source_id);
  end if;

  return coalesce(new, old);
end;
$function$;

create or replace function public.set_clip_sources_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.set_clips_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- Remove the audited legacy policies that allowed anonymous or PUBLIC access.
-- The earlier channel-isolation migration has already installed named RBHQ
-- permissive gates plus restrictive channel/admin policies before these drops.
drop policy if exists anon_select_channels on public.channels;
drop policy if exists anon_select_posts on public.posts;
drop policy if exists anon_update_posts on public.posts;
drop policy if exists anon_select_user_channels on public.user_channels;
drop policy if exists anon_select_users on public.users;
drop policy if exists anon_insert_audit_logs on public.war_room_audit_logs;
drop policy if exists anon_select_audit_logs on public.war_room_audit_logs;
drop policy if exists learning_weights_all on public.learning_weights;
drop policy if exists reply_feedback_all on public.reply_feedback;
drop policy if exists reply_sessions_all on public.reply_sessions;
drop policy if exists "Users can manage own settings" on public.user_settings;

-- Reassert object and future-object containment after every Phase 1 object has
-- been created. PUBLIC retains schema discovery for Supabase compatibility but
-- receives no public-function execution or table data privileges.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated, service_role;

-- Abort atomically if any public table would be left outside Phase 1 RLS or
-- without a policy. A policy-free table is fail-closed, but it is still a
-- release defect because the application expects explicit admin/operator rules.
do $release_security_gate$
declare
  rls_disabled text;
  policy_missing text;
  anon_relations text;
  anon_sequences text;
  anon_functions text;
begin
  select string_agg(format('public.%I', relation.relname), ', ' order by relation.relname)
  into rls_disabled
  from pg_class as relation
  join pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and not relation.relrowsecurity;

  if rls_disabled is not null then
    raise exception 'RBHQ_RLS_DISABLED: %', rls_disabled;
  end if;

  select string_agg(format('public.%I', relation.relname), ', ' order by relation.relname)
  into policy_missing
  from pg_class as relation
  join pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and not exists (
      select 1
      from pg_policy as policy
      where policy.polrelid = relation.oid
    );

  if policy_missing is not null then
    raise exception 'RBHQ_RLS_POLICY_MISSING: %', policy_missing;
  end if;

  select string_agg(format('public.%I', relation.relname), ', ' order by relation.relname)
  into anon_relations
  from pg_class as relation
  join pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p', 'v', 'm')
    and has_table_privilege(
      'anon',
      relation.oid,
      'select, insert, update, delete, truncate, references, trigger'
    );

  if anon_relations is not null then
    raise exception 'RBHQ_ANON_RELATION_PRIVILEGE: %', anon_relations;
  end if;

  select string_agg(format('public.%I', relation.relname), ', ' order by relation.relname)
  into anon_sequences
  from pg_class as relation
  join pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind = 'S'
    and case
      when relation.relkind = 'S'
        then has_sequence_privilege('anon', relation.oid, 'usage, select, update')
      else false
    end;

  if anon_sequences is not null then
    raise exception 'RBHQ_ANON_SEQUENCE_PRIVILEGE: %', anon_sequences;
  end if;

  select string_agg(routine.oid::regprocedure::text, ', ' order by routine.oid::regprocedure::text)
  into anon_functions
  from pg_proc as routine
  join pg_namespace as namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
    and has_function_privilege('anon', routine.oid, 'execute');

  if anon_functions is not null then
    raise exception 'RBHQ_ANON_FUNCTION_EXECUTE: %', anon_functions;
  end if;
end
$release_security_gate$;

commit;
