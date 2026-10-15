-- RBHQ Phase 1, stage 3: explicit RLS policies.
-- Only RBHQ-owned policy names are replaced; unrelated policies are preserved.
begin;

alter table public.users enable row level security;
alter table public.users force row level security;
drop policy if exists rbhq_users_admin_all on public.users;
drop policy if exists rbhq_users_self_read on public.users;
drop policy if exists rbhq_authenticated_gate on public.users;
drop policy if exists rbhq_users_select_scope on public.users;
drop policy if exists rbhq_users_insert_scope on public.users;
drop policy if exists rbhq_users_update_scope on public.users;
drop policy if exists rbhq_users_delete_scope on public.users;
revoke all on public.users from anon;
grant select, insert, update, delete on public.users to authenticated, service_role;
create policy rbhq_authenticated_gate on public.users
  as permissive for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
create policy rbhq_users_select_scope on public.users
  as restrictive
  for select to authenticated
  using ((select private.rbhq_is_super_admin()) or id = (select auth.uid()));
create policy rbhq_users_insert_scope on public.users
  as restrictive for insert to authenticated
  with check ((select private.rbhq_is_super_admin()));
create policy rbhq_users_update_scope on public.users
  as restrictive for update to authenticated
  using ((select private.rbhq_is_super_admin()))
  with check ((select private.rbhq_is_super_admin()));
create policy rbhq_users_delete_scope on public.users
  as restrictive for delete to authenticated
  using ((select private.rbhq_is_super_admin()));

alter table public.channels enable row level security;
alter table public.channels force row level security;
drop policy if exists rbhq_channels_admin_all on public.channels;
drop policy if exists rbhq_channels_assigned_read on public.channels;
drop policy if exists rbhq_authenticated_gate on public.channels;
drop policy if exists rbhq_channels_select_scope on public.channels;
drop policy if exists rbhq_channels_insert_scope on public.channels;
drop policy if exists rbhq_channels_update_scope on public.channels;
drop policy if exists rbhq_channels_delete_scope on public.channels;
revoke all on public.channels from anon;
grant select, insert, update, delete on public.channels to authenticated, service_role;
create policy rbhq_authenticated_gate on public.channels
  as permissive for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
create policy rbhq_channels_select_scope on public.channels
  as restrictive
  for select to authenticated
  using ((select private.rbhq_is_super_admin()) or (select private.rbhq_can_access_channel(id)));
create policy rbhq_channels_insert_scope on public.channels
  as restrictive for insert to authenticated
  with check ((select private.rbhq_is_super_admin()));
create policy rbhq_channels_update_scope on public.channels
  as restrictive for update to authenticated
  using ((select private.rbhq_is_super_admin()))
  with check ((select private.rbhq_is_super_admin()));
create policy rbhq_channels_delete_scope on public.channels
  as restrictive for delete to authenticated
  using ((select private.rbhq_is_super_admin()));

alter table public.operator_channel_assignments enable row level security;
alter table public.operator_channel_assignments force row level security;
drop policy if exists rbhq_assignments_admin_all on public.operator_channel_assignments;
drop policy if exists rbhq_assignments_self_read on public.operator_channel_assignments;
drop policy if exists rbhq_authenticated_gate on public.operator_channel_assignments;
drop policy if exists rbhq_assignments_select_scope on public.operator_channel_assignments;
drop policy if exists rbhq_assignments_insert_scope on public.operator_channel_assignments;
drop policy if exists rbhq_assignments_update_scope on public.operator_channel_assignments;
drop policy if exists rbhq_assignments_delete_scope on public.operator_channel_assignments;
create policy rbhq_authenticated_gate on public.operator_channel_assignments
  as permissive for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
create policy rbhq_assignments_select_scope on public.operator_channel_assignments
  as restrictive
  for select to authenticated
  using ((select private.rbhq_is_super_admin()) or user_id = (select auth.uid()));
create policy rbhq_assignments_insert_scope on public.operator_channel_assignments
  as restrictive for insert to authenticated
  with check ((select private.rbhq_is_super_admin()));
create policy rbhq_assignments_update_scope on public.operator_channel_assignments
  as restrictive for update to authenticated
  using ((select private.rbhq_is_super_admin()))
  with check ((select private.rbhq_is_super_admin()));
create policy rbhq_assignments_delete_scope on public.operator_channel_assignments
  as restrictive for delete to authenticated
  using ((select private.rbhq_is_super_admin()));

revoke all on public.operator_channel_assignments from anon;
grant select, insert, update, delete on public.operator_channel_assignments to authenticated, service_role;

-- Migration-local installers are invoked with an explicit table/column list.
create function pg_temp.rbhq_install_direct_policy(target_table_name text, target_channel_column text)
returns void language plpgsql as $$
begin
  if to_regclass(format('public.%I', target_table_name)) is null or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and information_schema.columns.table_name = target_table_name
      and column_name = target_channel_column
  ) then
    return;
  end if;

  execute format('alter table public.%I enable row level security', target_table_name);
  execute format('alter table public.%I force row level security', target_table_name);
  execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', target_table_name);
  execute format('drop policy if exists rbhq_authenticated_gate on public.%I', target_table_name);
  execute format('drop policy if exists rbhq_channel_isolation on public.%I', target_table_name);
  execute format(
    'create policy rbhq_authenticated_gate on public.%I as permissive for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null)',
    target_table_name
  );
  execute format(
    'create policy rbhq_channel_isolation on public.%I as restrictive for all to authenticated using ((select private.rbhq_can_access_channel(%I))) with check ((select private.rbhq_can_access_channel(%I)))',
    target_table_name,
    target_channel_column,
    target_channel_column
  );
end
$$;

select pg_temp.rbhq_install_direct_policy('clips', 'channel_id');
select pg_temp.rbhq_install_direct_policy('sources', 'channel_id');
select pg_temp.rbhq_install_direct_policy('posts', 'channel_id');
select pg_temp.rbhq_install_direct_policy('queue_jobs', 'channel_id');
select pg_temp.rbhq_install_direct_policy('source_suggestions', 'channel_id');
select pg_temp.rbhq_install_direct_policy('source_channels', 'target_rbhq_channel_id');
select pg_temp.rbhq_install_direct_policy('clip_candidates', 'target_channel_id');
select pg_temp.rbhq_install_direct_policy('mac_mini_clip_packages', 'target_channel_id');
select pg_temp.rbhq_install_direct_policy('metricool_handoffs', 'channel_id');
select pg_temp.rbhq_install_direct_policy('n8n_handoffs', 'channel_id');
select pg_temp.rbhq_install_direct_policy('clip_sources', 'channel_id');
select pg_temp.rbhq_install_direct_policy('post_log', 'channel_id');
select pg_temp.rbhq_install_direct_policy('processed_videos', 'channel_id');
select pg_temp.rbhq_install_direct_policy('publish_logs', 'channel_id');
select pg_temp.rbhq_install_direct_policy('rbhq_clips', 'channel_id');
select pg_temp.rbhq_install_direct_policy('rbhq_source_items', 'channel_id');

-- Indirect ownership: ingested_videos -> source_channels.
do $ingested_video_policy$
begin
  if to_regclass('public.ingested_videos') is not null then
    alter table public.ingested_videos enable row level security;
    alter table public.ingested_videos force row level security;
    grant select, insert, update, delete on public.ingested_videos to authenticated, service_role;
    drop policy if exists rbhq_authenticated_gate on public.ingested_videos;
    drop policy if exists rbhq_ingested_videos_channel_isolation on public.ingested_videos;
    create policy rbhq_authenticated_gate on public.ingested_videos
      as permissive for all to authenticated
      using ((select auth.uid()) is not null)
      with check ((select auth.uid()) is not null);
    create policy rbhq_ingested_videos_channel_isolation on public.ingested_videos
      as restrictive
      for all to authenticated
      using (
        (select private.rbhq_is_super_admin()) or exists (
          select 1 from public.source_channels as source
          where source.id = ingested_videos.source_channel_id
            and (select private.rbhq_can_access_channel(source.target_rbhq_channel_id))
        )
      )
      with check (
        (select private.rbhq_is_super_admin()) or exists (
          select 1 from public.source_channels as source
          where source.id = ingested_videos.source_channel_id
            and (select private.rbhq_can_access_channel(source.target_rbhq_channel_id))
        )
      );
  end if;
end
$ingested_video_policy$;

-- Indirect ownership: video_transcripts -> ingested_videos -> source_channels.
do $video_transcript_policy$
begin
  if to_regclass('public.video_transcripts') is not null then
    alter table public.video_transcripts enable row level security;
    alter table public.video_transcripts force row level security;
    grant select, insert, update, delete on public.video_transcripts to authenticated, service_role;
    drop policy if exists rbhq_authenticated_gate on public.video_transcripts;
    drop policy if exists rbhq_video_transcripts_channel_isolation on public.video_transcripts;
    create policy rbhq_authenticated_gate on public.video_transcripts
      as permissive for all to authenticated
      using ((select auth.uid()) is not null)
      with check ((select auth.uid()) is not null);
    create policy rbhq_video_transcripts_channel_isolation on public.video_transcripts
      as restrictive
      for all to authenticated
      using (
        (select private.rbhq_is_super_admin()) or exists (
          select 1
          from public.ingested_videos as video
          join public.source_channels as source on source.id = video.source_channel_id
          where video.id = video_transcripts.ingested_video_id
            and (select private.rbhq_can_access_channel(source.target_rbhq_channel_id))
        )
      )
      with check (
        (select private.rbhq_is_super_admin()) or exists (
          select 1
          from public.ingested_videos as video
          join public.source_channels as source on source.id = video.source_channel_id
          where video.id = video_transcripts.ingested_video_id
            and (select private.rbhq_can_access_channel(source.target_rbhq_channel_id))
        )
      );
  end if;
end
$video_transcript_policy$;

create function pg_temp.rbhq_install_post_child_policy(target_table_name text, target_post_column text)
returns void language plpgsql as $$
begin
  if to_regclass(format('public.%I', target_table_name)) is null or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and information_schema.columns.table_name = target_table_name
      and column_name = target_post_column
  ) then
    return;
  end if;

  execute format('alter table public.%I enable row level security', target_table_name);
  execute format('alter table public.%I force row level security', target_table_name);
  execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', target_table_name);
  execute format('drop policy if exists rbhq_authenticated_gate on public.%I', target_table_name);
  execute format('drop policy if exists rbhq_post_channel_isolation on public.%I', target_table_name);
  execute format(
    'create policy rbhq_authenticated_gate on public.%I as permissive for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null)',
    target_table_name
  );
  execute format(
    'create policy rbhq_post_channel_isolation on public.%I as restrictive for all to authenticated using ((select private.rbhq_is_super_admin()) or exists (select 1 from public.posts as owner_post where owner_post.id = %I and (select private.rbhq_can_access_channel(owner_post.channel_id)))) with check ((select private.rbhq_is_super_admin()) or exists (select 1 from public.posts as owner_post where owner_post.id = %I and (select private.rbhq_can_access_channel(owner_post.channel_id))))',
    target_table_name,
    target_post_column,
    target_post_column
  );
end
$$;

-- publish_jobs -> posts through clip_id.
select pg_temp.rbhq_install_post_child_policy('publish_jobs', 'clip_id');
-- publish_events -> posts through post_id.
select pg_temp.rbhq_install_post_child_policy('publish_events', 'post_id');
-- rbhq_analytics_snapshots -> posts through post_id.
select pg_temp.rbhq_install_post_child_policy('rbhq_analytics_snapshots', 'post_id');
-- reply_sessions -> posts through post_id.
select pg_temp.rbhq_install_post_child_policy('reply_sessions', 'post_id');
-- war_room_audit_logs -> posts through post_id.
select pg_temp.rbhq_install_post_child_policy('war_room_audit_logs', 'post_id');

-- reply_feedback -> reply_sessions -> posts.
do $reply_feedback_policy$
begin
  if to_regclass('public.reply_feedback') is not null then
    alter table public.reply_feedback enable row level security;
    alter table public.reply_feedback force row level security;
    grant select, insert, update, delete on public.reply_feedback to authenticated, service_role;
    drop policy if exists rbhq_authenticated_gate on public.reply_feedback;
    drop policy if exists rbhq_reply_feedback_channel_isolation on public.reply_feedback;
    create policy rbhq_authenticated_gate on public.reply_feedback
      as permissive for all to authenticated
      using ((select auth.uid()) is not null)
      with check ((select auth.uid()) is not null);
    create policy rbhq_reply_feedback_channel_isolation on public.reply_feedback
      as restrictive
      for all to authenticated
      using (
        (select private.rbhq_is_super_admin()) or exists (
          select 1
          from public.reply_sessions as reply_session
          join public.posts as owner_post on owner_post.id = reply_session.post_id
          where reply_session.id = reply_feedback.reply_session_id
            and (select private.rbhq_can_access_channel(owner_post.channel_id))
        )
      )
      with check (
        (select private.rbhq_is_super_admin()) or exists (
          select 1
          from public.reply_sessions as reply_session
          join public.posts as owner_post on owner_post.id = reply_session.post_id
          where reply_session.id = reply_feedback.reply_session_id
            and (select private.rbhq_can_access_channel(owner_post.channel_id))
        )
      );
  end if;
end
$reply_feedback_policy$;

-- rbhq_clip_scores -> rbhq_clips through clip_id.
do $clip_score_policy$
begin
  if to_regclass('public.rbhq_clip_scores') is not null then
    alter table public.rbhq_clip_scores enable row level security;
    alter table public.rbhq_clip_scores force row level security;
    grant select, insert, update, delete on public.rbhq_clip_scores to authenticated, service_role;
    drop policy if exists rbhq_authenticated_gate on public.rbhq_clip_scores;
    drop policy if exists rbhq_clip_scores_channel_isolation on public.rbhq_clip_scores;
    create policy rbhq_authenticated_gate on public.rbhq_clip_scores
      as permissive for all to authenticated
      using ((select auth.uid()) is not null)
      with check ((select auth.uid()) is not null);
    create policy rbhq_clip_scores_channel_isolation on public.rbhq_clip_scores
      as restrictive
      for all to authenticated
      using (
        (select private.rbhq_is_super_admin()) or exists (
          select 1 from public.rbhq_clips as owner_clip
          where owner_clip.id = rbhq_clip_scores.clip_id
            and (select private.rbhq_can_access_channel(owner_clip.channel_id))
        )
      )
      with check (
        (select private.rbhq_is_super_admin()) or exists (
          select 1 from public.rbhq_clips as owner_clip
          where owner_clip.id = rbhq_clip_scores.clip_id
            and (select private.rbhq_can_access_channel(owner_clip.channel_id))
        )
      );
  end if;
end
$clip_score_policy$;

-- Event/action tables inherit ownership from the referenced entity.
create function pg_temp.rbhq_install_workflow_child_policy(target_table_name text)
returns void language plpgsql as $$
begin
  if to_regclass(format('public.%I', target_table_name)) is null then return; end if;
  execute format('alter table public.%I enable row level security', target_table_name);
  execute format('alter table public.%I force row level security', target_table_name);
  execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', target_table_name);
  execute format('drop policy if exists rbhq_authenticated_gate on public.%I', target_table_name);
  execute format('drop policy if exists rbhq_workflow_channel_isolation on public.%I', target_table_name);
  execute format(
    'create policy rbhq_authenticated_gate on public.%I as permissive for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null)',
    target_table_name
  );
  execute format(
    'create policy rbhq_workflow_channel_isolation on public.%I as restrictive for all to authenticated using ((select private.rbhq_is_super_admin()) or (entity_type = ''source_item'' and exists (select 1 from public.rbhq_source_items x where x.id = entity_id and (select private.rbhq_can_access_channel(x.channel_id)))) or (entity_type = ''clip'' and exists (select 1 from public.rbhq_clips x where x.id = entity_id and (select private.rbhq_can_access_channel(x.channel_id)))) or (entity_type = ''post'' and exists (select 1 from public.posts x where x.id = entity_id and (select private.rbhq_can_access_channel(x.channel_id))))) with check ((select private.rbhq_is_super_admin()) or (entity_type = ''source_item'' and exists (select 1 from public.rbhq_source_items x where x.id = entity_id and (select private.rbhq_can_access_channel(x.channel_id)))) or (entity_type = ''clip'' and exists (select 1 from public.rbhq_clips x where x.id = entity_id and (select private.rbhq_can_access_channel(x.channel_id)))) or (entity_type = ''post'' and exists (select 1 from public.posts x where x.id = entity_id and (select private.rbhq_can_access_channel(x.channel_id)))))',
    target_table_name
  );
end
$$;

select pg_temp.rbhq_install_workflow_child_policy('rbhq_workflow_events');
select pg_temp.rbhq_install_workflow_child_policy('rbhq_operator_actions');

-- User settings remain self-scoped; an operator can only select its assigned default.
do $user_settings_policy$
begin
  if to_regclass('public.user_settings') is not null then
    alter table public.user_settings enable row level security;
    alter table public.user_settings force row level security;
    grant select, insert, update, delete on public.user_settings to authenticated, service_role;
    drop policy if exists rbhq_authenticated_gate on public.user_settings;
    drop policy if exists rbhq_user_settings_isolation on public.user_settings;
    create policy rbhq_authenticated_gate on public.user_settings
      as permissive for all to authenticated
      using ((select auth.uid()) is not null)
      with check ((select auth.uid()) is not null);
    create policy rbhq_user_settings_isolation on public.user_settings
      as restrictive
      for all to authenticated
      using ((select private.rbhq_is_super_admin()) or user_id = (select auth.uid()))
      with check (
        (select private.rbhq_is_super_admin()) or (
          user_id = (select auth.uid())
          and (select private.rbhq_can_access_channel(default_channel_id))
        )
      );
  end if;
end
$user_settings_policy$;

create function pg_temp.rbhq_install_admin_only_policy(target_table_name text)
returns void language plpgsql as $$
begin
  if to_regclass(format('public.%I', target_table_name)) is null then return; end if;
  execute format('alter table public.%I enable row level security', target_table_name);
  execute format('alter table public.%I force row level security', target_table_name);
  execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', target_table_name);
  execute format('drop policy if exists rbhq_authenticated_gate on public.%I', target_table_name);
  execute format('drop policy if exists rbhq_super_admin_only on public.%I', target_table_name);
  execute format(
    'create policy rbhq_authenticated_gate on public.%I as permissive for all to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null)',
    target_table_name
  );
  execute format(
    'create policy rbhq_super_admin_only on public.%I as restrictive for all to authenticated using ((select private.rbhq_is_super_admin())) with check ((select private.rbhq_is_super_admin()))',
    target_table_name
  );
end
$$;

select pg_temp.rbhq_install_admin_only_policy('social_accounts');
select pg_temp.rbhq_install_admin_only_policy('channel_social_bindings');
select pg_temp.rbhq_install_admin_only_policy('credential_refs');
select pg_temp.rbhq_install_admin_only_policy('social_credentials');
select pg_temp.rbhq_install_admin_only_policy('publishing_credentials');

commit;
