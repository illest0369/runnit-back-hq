-- RBHQ Phase 1, stage 1: additive tenancy schema and private policy helpers.
-- This migration does not backfill data or replace table policies.
begin;

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table if not exists public.operator_channel_assignments (
  user_id uuid primary key references public.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete restrict,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operator_channel_assignments_channel_id_idx
  on public.operator_channel_assignments (channel_id);

-- New source-item writes are channel-scoped. Existing null rows are reconciled
-- only when their clip relationships prove a single owner in stage 2.
do $source_item_scope$
begin
  if to_regclass('public.rbhq_source_items') is not null then
    alter table public.rbhq_source_items
      add column if not exists channel_id uuid references public.channels(id) on delete restrict;
    create index if not exists rbhq_source_items_channel_id_idx
      on public.rbhq_source_items (channel_id);
  end if;
end
$source_item_scope$;

create or replace function private.rbhq_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users
    where id = (select auth.uid())
      and lower(coalesce(role::text, '')) in ('admin', 'super_admin')
  )
$$;

create or replace function private.rbhq_current_channel_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select channel_id
  from public.operator_channel_assignments
  where user_id = (select auth.uid())
$$;

create or replace function private.rbhq_can_access_channel(target_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.rbhq_is_super_admin())
    or (
      target_channel_id is not null
      and target_channel_id = (select private.rbhq_current_channel_id())
    )
$$;

revoke all on function private.rbhq_is_super_admin() from public;
revoke all on function private.rbhq_current_channel_id() from public;
revoke all on function private.rbhq_can_access_channel(uuid) from public;
grant execute on function private.rbhq_is_super_admin() to authenticated, service_role;
grant execute on function private.rbhq_current_channel_id() to authenticated, service_role;
grant execute on function private.rbhq_can_access_channel(uuid) to authenticated, service_role;

commit;
