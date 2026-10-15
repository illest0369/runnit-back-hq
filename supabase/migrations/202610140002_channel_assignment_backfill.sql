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

insert into public.operator_channel_assignments (user_id, channel_id)
select legacy.user_id, min(legacy.channel_id::text)::uuid
from pg_temp.rbhq_legacy_operator_channels as legacy
join public.users as users on users.id = legacy.user_id
where lower(coalesce(users.role::text, 'operator')) not in ('admin', 'super_admin')
group by legacy.user_id
having count(distinct legacy.channel_id) = 1
on conflict (user_id) do nothing;

-- Only infer source-item ownership when every linked clip agrees on one channel.
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

commit;
