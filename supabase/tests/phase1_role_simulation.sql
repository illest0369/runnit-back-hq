\set ON_ERROR_STOP on

begin;

insert into public.channels (id, name, handle, category, status)
values
  ('93484eef-06d8-46fd-bce2-ce252422c58e', 'RB CFB', 'runnitbackcfb', 'college_football', 'active'),
  ('a1000000-0000-0000-0000-000000000001', 'RB Sports', 'runnitbacksports', 'sports', 'active');

insert into public.users (id, username, pin_hash, role)
values
  ('b1000000-0000-4000-8000-000000000001', 'simulated-rb-cfb-operator', 'not-a-login-secret', 'operator'),
  ('b1000000-0000-4000-8000-000000000002', 'simulated-foreign-operator', 'not-a-login-secret', 'operator'),
  ('b1000000-0000-4000-8000-000000000003', 'simulated-admin', 'not-a-login-secret', 'admin');

insert into public.operator_channel_assignments (user_id, channel_id)
values
  ('b1000000-0000-4000-8000-000000000001', '93484eef-06d8-46fd-bce2-ce252422c58e'),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-0000-0000-000000000001');

insert into public.source_suggestions (
  id,
  channel_id,
  operator_id,
  source_url,
  source_title,
  reasoning,
  metadata
)
values
  (
    'c1000000-0000-4000-8000-000000000001',
    '93484eef-06d8-46fd-bce2-ce252422c58e',
    'b1000000-0000-4000-8000-000000000001',
    'https://example.invalid/rb-cfb',
    'RB CFB simulated source',
    '["role simulation"]'::jsonb,
    '{"test": true}'::jsonb
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    'a1000000-0000-0000-0000-000000000001',
    'b1000000-0000-4000-8000-000000000002',
    'https://example.invalid/rb-sports',
    'RB Sports simulated source',
    '["role simulation"]'::jsonb,
    '{"test": true}'::jsonb
  );

insert into public.queue_jobs (id, channel_id, source_url, status)
values
  (
    'd1000000-0000-4000-8000-000000000001',
    '93484eef-06d8-46fd-bce2-ce252422c58e',
    'https://example.invalid/rb-cfb-video',
    'queued'
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'a1000000-0000-0000-0000-000000000001',
    'https://example.invalid/rb-sports-video',
    'queued'
  );

insert into public.posts (
  id,
  clip_id,
  channel_id,
  platform,
  destination,
  caption,
  video_url
)
values
  (
    'e1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    '93484eef-06d8-46fd-bce2-ce252422c58e',
    'tiktok',
    'manual',
    'RB CFB simulated post',
    'https://example.invalid/rb-cfb.mp4'
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000002',
    'a1000000-0000-0000-0000-000000000001',
    'tiktok',
    'manual',
    'RB Sports simulated post',
    'https://example.invalid/rb-sports.mp4'
  );

insert into public.publish_events (post_id, event_type, payload, success)
values
  (
    'e1000000-0000-4000-8000-000000000001',
    'simulated_ready',
    '{"test": true}'::jsonb,
    true
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    'simulated_ready',
    '{"test": true}'::jsonb,
    true
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

do $rb_cfb_operator$
declare
  visible_channels integer;
  visible_suggestions integer;
  visible_assignments integer;
  visible_publish_events integer;
begin
  select count(*) into visible_channels from public.channels;
  if visible_channels <> 1 then
    raise exception 'RBHQ_SIMULATED_OPERATOR_CHANNEL_COUNT: %', visible_channels;
  end if;

  if not exists (
    select 1 from public.channels
    where id = '93484eef-06d8-46fd-bce2-ce252422c58e'
  ) then
    raise exception 'RBHQ_SIMULATED_OPERATOR_RB_CFB_MISSING';
  end if;

  select count(*) into visible_suggestions from public.source_suggestions;
  if visible_suggestions <> 1 then
    raise exception 'RBHQ_SIMULATED_OPERATOR_SUGGESTION_COUNT: %', visible_suggestions;
  end if;

  select count(*) into visible_assignments from public.operator_channel_assignments;
  if visible_assignments <> 1 then
    raise exception 'RBHQ_SIMULATED_OPERATOR_ASSIGNMENT_COUNT: %', visible_assignments;
  end if;

  select count(*) into visible_publish_events from public.publish_events;
  if visible_publish_events <> 1 then
    raise exception 'RBHQ_SIMULATED_OPERATOR_PUBLISH_EVENT_COUNT: %', visible_publish_events;
  end if;

  begin
    insert into public.source_suggestions (
      channel_id,
      operator_id,
      source_url,
      source_title
    ) values (
      'a1000000-0000-0000-0000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      'https://example.invalid/forbidden',
      'Expected RLS denial'
    );
    raise exception 'RBHQ_SIMULATED_OPERATOR_FOREIGN_WRITE_ALLOWED';
  exception
    when insufficient_privilege then null;
  end;


  begin
    insert into public.publish_events (post_id, event_type, success)
    values (
      'e1000000-0000-4000-8000-000000000002',
      'expected_rls_denial',
      false
    );
    raise exception 'RBHQ_SIMULATED_OPERATOR_FOREIGN_PUBLISH_EVENT_ALLOWED';
  exception
    when insufficient_privilege then null;
  end;
end
$rb_cfb_operator$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000003', true);

do $admin_access$
declare
  visible_channels integer;
  visible_suggestions integer;
  visible_assignments integer;
  visible_publish_events integer;
begin
  select count(*) into visible_channels from public.channels;
  select count(*) into visible_suggestions from public.source_suggestions;
  select count(*) into visible_assignments from public.operator_channel_assignments;
  select count(*) into visible_publish_events from public.publish_events;

  if visible_channels <> 2 or visible_suggestions <> 2 or visible_assignments <> 2 or visible_publish_events <> 2 then
    raise exception 'RBHQ_SIMULATED_ADMIN_SCOPE: channels %, suggestions %, assignments %, publish events %',
      visible_channels, visible_suggestions, visible_assignments, visible_publish_events;
  end if;

  insert into public.source_suggestions (
    channel_id,
    operator_id,
    source_url,
    source_title
  ) values (
    '93484eef-06d8-46fd-bce2-ce252422c58e',
    'b1000000-0000-4000-8000-000000000003',
    'https://example.invalid/admin-rb-cfb',
    'Expected administrator cross-channel success'
  );

  insert into public.publish_events (post_id, event_type, success)
  values (
    'e1000000-0000-4000-8000-000000000001',
    'simulated_admin_audit',
    true
  );
end
$admin_access$;

reset role;
set local role anon;

do $anonymous_acl$
begin
  if has_table_privilege(current_user, 'public.channels', 'select') then
    raise exception 'RBHQ_SIMULATED_ANON_TABLE_ACCESS';
  end if;
end
$anonymous_acl$;

reset role;

do $anonymous_function_acl$
begin
  if exists (
    select 1
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname in (
        'refresh_clip_source_counts',
        'refresh_clip_source_counts_trigger',
        'set_clip_sources_updated_at',
        'set_clips_updated_at'
      )
      and has_function_privilege('anon', routine.oid, 'execute')
  ) then
    raise exception 'RBHQ_SIMULATED_ANON_FUNCTION_EXECUTE';
  end if;
end
$anonymous_function_acl$;

rollback;

select 'PASS RB CFB operator isolation, administrator scope, and anonymous ACL simulation';
