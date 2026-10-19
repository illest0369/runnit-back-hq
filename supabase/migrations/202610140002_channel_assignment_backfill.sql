-- RBHQ Phase 1, stage 2: conservative data backfill.
-- Operators with zero or multiple legacy channels remain unassigned and fail closed.
begin;

create temp table rbhq_legacy_operator_channels (
  user_id uuid not null,
  channel_id uuid not null
) on commit drop;

do $legacy_assignments$
begin
  if to_regclass('public.user_channel_access') is not null then
    execute $sql$
      insert into pg_temp.rbhq_legacy_operator_channels (user_id, channel_id)
      select users.id, channels.id
      from public.user_channel_access as legacy
      join public.users as users on users.id::text = legacy.user_id::text
      join public.channels as channels on channels.id::text = legacy.channel_id::text
    $sql$;
  end if;

  if to_regclass('public.user_channels') is not null then
    execute $sql$
      insert into pg_temp.rbhq_legacy_operator_channels (user_id, channel_id)
      select users.id, channels.id
      from public.user_channels as legacy
      join public.users as users on users.id::text = legacy.user_id::text
      join public.channels as channels on channels.id::text = legacy.channel_id::text
    $sql$;
  end if;
end
$legacy_assignments$;

-- Owner-confirmed production assignment. Keep this inside the same transaction
-- as the remaining operator backfill so a stale identity, role, or channel
-- mapping aborts the entire stage before RLS is enabled.
do $owner_confirmed_thomas_assignment$
declare
  thomas_user_id constant uuid := 'd661928a-95a7-40e6-862d-fb18e78bf583';
  rb_cfb_channel_id constant uuid := '93484eef-06d8-46fd-bce2-ce252422c58e';
begin
  -- Clean development databases may not contain production identities. Skip
  -- only when both owner-confirmed records are wholly absent; a partial or
  -- changed match is drift and must fail closed.
  if not exists (
    select 1 from public.users where lower(username) = 'thomas'
  ) and not exists (
    select 1
    from public.channels
    where lower(name) = 'rb cfb'
       or lower(trim(both '@' from coalesce(handle, ''))) = 'runnitbackcfb'
  ) then
    return;
  end if;

  if (
    select count(*)
    from public.users
    where lower(username) = 'thomas'
  ) <> 1 then
    raise exception 'RBHQ_OWNER_CONFIRMED_ASSIGNMENT_INVALID: expected one Thomas user';
  end if;

  if not exists (
    select 1
    from public.users
    where id = thomas_user_id
      and lower(username) = 'thomas'
      and lower(coalesce(role::text, '')) = 'operator'
  ) then
    raise exception 'RBHQ_OWNER_CONFIRMED_ASSIGNMENT_INVALID: Thomas identity or role changed';
  end if;

  if (
    select count(*)
    from public.channels
    where lower(name) = 'rb cfb'
      and lower(trim(both '@' from coalesce(handle, ''))) = 'runnitbackcfb'
  ) <> 1 then
    raise exception 'RBHQ_OWNER_CONFIRMED_ASSIGNMENT_INVALID: expected one RB CFB channel';
  end if;

  if not exists (
    select 1
    from public.channels
    where id = rb_cfb_channel_id
      and lower(name) = 'rb cfb'
      and lower(trim(both '@' from coalesce(handle, ''))) = 'runnitbackcfb'
  ) then
    raise exception 'RBHQ_OWNER_CONFIRMED_ASSIGNMENT_INVALID: RB CFB identity or handle changed';
  end if;

  if exists (
    select 1
    from public.operator_channel_assignments
    where user_id = thomas_user_id
      and channel_id <> rb_cfb_channel_id
  ) then
    raise exception 'RBHQ_OWNER_CONFIRMED_ASSIGNMENT_INVALID: Thomas already has another channel';
  end if;

  insert into public.operator_channel_assignments (user_id, channel_id)
  values (thomas_user_id, rb_cfb_channel_id)
  on conflict (user_id) do nothing;

  if not exists (
    select 1
    from public.operator_channel_assignments
    where user_id = thomas_user_id
      and channel_id = rb_cfb_channel_id
  ) then
    raise exception 'RBHQ_OWNER_CONFIRMED_ASSIGNMENT_INVALID: Thomas assignment was not persisted';
  end if;
end
$owner_confirmed_thomas_assignment$;

insert into public.operator_channel_assignments (user_id, channel_id)
select legacy.user_id, min(legacy.channel_id::text)::uuid
from pg_temp.rbhq_legacy_operator_channels as legacy
join public.users as users on users.id = legacy.user_id
where lower(coalesce(users.role::text, 'operator')) not in ('admin', 'super_admin')
group by legacy.user_id
having count(distinct legacy.channel_id) = 1
on conflict (user_id) do nothing;

-- Native-ingest source items carry a stable source id in raw_payload. Resolve
-- those first so downstream workflow rows inherit the same owner.
do $source_item_source_backfill$
begin
  if to_regclass('public.rbhq_source_items') is not null
     and to_regclass('public.sources') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'rbhq_source_items' and column_name = 'channel_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'rbhq_source_items' and column_name = 'raw_payload'
     ) then
    execute $sql$
      update public.rbhq_source_items as item
      set channel_id = source.channel_id
      from public.sources as source
      where item.channel_id is null
        and source.channel_id is not null
        and source.id::text = item.raw_payload ->> 'source_id'
    $sql$;
  end if;
end
$source_item_source_backfill$;

-- RBHQ clips inherit ownership from their source item.
do $rbhq_clip_backfill$
begin
  if to_regclass('public.rbhq_source_items') is not null
     and to_regclass('public.rbhq_clips') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'rbhq_clips' and column_name = 'channel_id'
     ) then
    execute $sql$
      update public.rbhq_clips as clip
      set channel_id = item.channel_id
      from public.rbhq_source_items as item
      where clip.source_item_id = item.id
        and clip.channel_id is null
        and item.channel_id is not null
    $sql$;
  end if;
end
$rbhq_clip_backfill$;

-- Only infer remaining source-item ownership when every linked clip agrees on
-- one channel.
do $source_item_backfill$
begin
  if to_regclass('public.rbhq_source_items') is not null
     and to_regclass('public.rbhq_clips') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'rbhq_clips' and column_name = 'source_item_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'rbhq_clips' and column_name = 'channel_id'
     ) then
    execute $sql$
      update public.rbhq_source_items as item
      set channel_id = resolved.channel_id
      from (
        select source_item_id, min(channel_id::text)::uuid as channel_id
        from public.rbhq_clips
        where source_item_id is not null and channel_id is not null
        group by source_item_id
        having count(distinct channel_id) = 1
      ) as resolved
      where item.id = resolved.source_item_id
        and item.channel_id is null
    $sql$;
  end if;
end
$source_item_backfill$;

-- Legacy clip-source aggregates become channel-scoped only when all related
-- clips agree on one owner.
do $clip_source_backfill$
begin
  if to_regclass('public.clip_sources') is not null
     and to_regclass('public.clips') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'clip_sources' and column_name = 'channel_id'
     ) then
    execute $sql$
      update public.clip_sources as source
      set channel_id = resolved.channel_id
      from (
        select source_id, min(channel_id::text)::uuid as channel_id
        from public.clips
        where source_id is not null and channel_id is not null
        group by source_id
        having count(distinct channel_id) = 1
      ) as resolved
      where source.id = resolved.source_id
        and source.channel_id is null
    $sql$;

    -- Keep the legacy global uniqueness constraint until every existing source
    -- has an owner. This prevents an unsafe write window between stages 1 and 2.
    if not exists (select 1 from public.clip_sources where channel_id is null) then
      alter table public.clip_sources
        drop constraint if exists clip_sources_source_name_source_type_key;
    end if;
  end if;
end
$clip_source_backfill$;

-- Existing candidates already inherit ownership from their ingested video's
-- source channel. Backfill only missing targets.
do $clip_candidate_backfill$
begin
  if to_regclass('public.clip_candidates') is not null
     and to_regclass('public.ingested_videos') is not null
     and to_regclass('public.source_channels') is not null then
    execute $sql$
      update public.clip_candidates as candidate
      set target_channel_id = source.target_rbhq_channel_id
      from public.ingested_videos as video
      join public.source_channels as source on source.id = video.source_channel_id
      where candidate.ingested_video_id = video.id
        and candidate.target_channel_id is null
        and source.target_rbhq_channel_id is not null
    $sql$;
  end if;
end
$clip_candidate_backfill$;

-- Do not silently roll out with an unassigned or multiply-assigned operator.
-- Super admins are intentionally exempt and remain globally authorized.
do $operator_assignment_gate$
begin
  if exists (
    select 1
    from public.users as users
    left join public.operator_channel_assignments as assignment on assignment.user_id = users.id
    where lower(coalesce(users.role::text, 'operator')) not in ('admin', 'super_admin')
    group by users.id
    having count(assignment.channel_id) <> 1
  ) then
    raise exception 'RBHQ_OPERATOR_ASSIGNMENT_REQUIRED: every operator must have exactly one channel';
  end if;
end
$operator_assignment_gate$;

commit;
