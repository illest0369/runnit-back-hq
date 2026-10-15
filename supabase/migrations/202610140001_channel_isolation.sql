-- RBHQ Phase 1: strict single-channel operator tenancy.
-- Operators receive one authoritative assignment. Super admins retain global access.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.operator_channel_assignments (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operator_channel_assignments_channel_id_idx
  ON public.operator_channel_assignments (channel_id);

-- Preserve existing operators only when their legacy access resolves to one channel.
CREATE TEMP TABLE rbhq_legacy_operator_channels (
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL
) ON COMMIT DROP;

DO $backfill$
BEGIN
  IF to_regclass('public.user_channel_access') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO pg_temp.rbhq_legacy_operator_channels (user_id, channel_id)
      SELECT users.id, channels.id
      FROM public.user_channel_access AS legacy
      JOIN public.users AS users ON users.id::text = legacy.user_id::text
      JOIN public.channels AS channels ON channels.id::text = legacy.channel_id::text
    $sql$;
  END IF;

  IF to_regclass('public.user_channels') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO pg_temp.rbhq_legacy_operator_channels (user_id, channel_id)
      SELECT users.id, channels.id
      FROM public.user_channels AS legacy
      JOIN public.users AS users ON users.id::text = legacy.user_id::text
      JOIN public.channels AS channels ON channels.id::text = legacy.channel_id::text
    $sql$;
  END IF;
END
$backfill$;

INSERT INTO public.operator_channel_assignments (user_id, channel_id)
SELECT legacy.user_id, min(legacy.channel_id::text)::uuid
FROM pg_temp.rbhq_legacy_operator_channels AS legacy
JOIN public.users AS users ON users.id = legacy.user_id
WHERE lower(coalesce(users.role::text, 'operator')) NOT IN ('admin', 'super_admin')
GROUP BY legacy.user_id
HAVING count(DISTINCT legacy.channel_id) = 1
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.rbhq_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND lower(coalesce(role::text, '')) IN ('admin', 'super_admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.rbhq_current_channel_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT channel_id
  FROM public.operator_channel_assignments
  WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.rbhq_can_access_channel(target_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.rbhq_is_super_admin()
    OR (
      target_channel_id IS NOT NULL
      AND target_channel_id = public.rbhq_current_channel_id()
    )
$$;

REVOKE ALL ON FUNCTION public.rbhq_is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbhq_current_channel_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbhq_can_access_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbhq_is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rbhq_current_channel_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rbhq_can_access_channel(uuid) TO authenticated, service_role;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_channel_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingested_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clip_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mac_mini_clip_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metricool_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.n8n_handoffs ENABLE ROW LEVEL SECURITY;

-- Remove any older permissive policies from the RBHQ tenant tables. API and worker
-- access uses service_role; authenticated database access must use the policies below.
DO $clear_policies$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'channels', 'operator_channel_assignments', 'clips', 'sources',
    'posts', 'queue_jobs', 'source_suggestions', 'source_channels',
    'ingested_videos', 'video_transcripts', 'clip_candidates',
    'mac_mini_clip_packages', 'metricool_handoffs', 'n8n_handoffs',
    'publish_jobs', 'publish_events', 'rbhq_analytics_snapshots',
    'clip_sources', 'post_log', 'processed_videos', 'publish_logs',
    'rbhq_clip_scores', 'rbhq_clips', 'rbhq_operator_actions',
    'rbhq_source_items', 'rbhq_workflow_events', 'reply_feedback',
    'reply_sessions', 'user_settings', 'war_room_audit_logs'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    FOR policy_name IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_name, table_name);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END
$clear_policies$;

CREATE POLICY rbhq_users_admin_all
  ON public.users FOR ALL TO authenticated
  USING (public.rbhq_is_super_admin())
  WITH CHECK (public.rbhq_is_super_admin());

CREATE POLICY rbhq_users_self_read
  ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY rbhq_channels_admin_all
  ON public.channels FOR ALL TO authenticated
  USING (public.rbhq_is_super_admin())
  WITH CHECK (public.rbhq_is_super_admin());

CREATE POLICY rbhq_channels_assigned_read
  ON public.channels FOR SELECT TO authenticated
  USING (public.rbhq_can_access_channel(id));

CREATE POLICY rbhq_assignments_admin_all
  ON public.operator_channel_assignments FOR ALL TO authenticated
  USING (public.rbhq_is_super_admin())
  WITH CHECK (public.rbhq_is_super_admin());

CREATE POLICY rbhq_assignments_self_read
  ON public.operator_channel_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Tables with a direct channel ownership column.
DO $direct_channel_policies$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('clips', 'channel_id'),
      ('sources', 'channel_id'),
      ('posts', 'channel_id'),
      ('queue_jobs', 'channel_id'),
      ('source_suggestions', 'channel_id'),
      ('source_channels', 'target_rbhq_channel_id'),
      ('clip_candidates', 'target_channel_id'),
      ('mac_mini_clip_packages', 'target_channel_id'),
      ('metricool_handoffs', 'channel_id'),
      ('n8n_handoffs', 'channel_id'),
      ('clip_sources', 'channel_id'),
      ('post_log', 'channel_id'),
      ('processed_videos', 'channel_id'),
      ('publish_logs', 'channel_id'),
      ('rbhq_clip_scores', 'channel_id'),
      ('rbhq_clips', 'channel_id'),
      ('rbhq_operator_actions', 'channel_id'),
      ('rbhq_source_items', 'channel_id'),
      ('rbhq_workflow_events', 'channel_id'),
      ('reply_feedback', 'channel_id'),
      ('reply_sessions', 'channel_id'),
      ('war_room_audit_logs', 'channel_id')
    ) AS mappings(table_name, channel_column)
  LOOP
    IF to_regclass(format('public.%I', item.table_name)) IS NULL OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = item.table_name
        AND column_name = item.channel_column
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', item.table_name);
    EXECUTE format(
      'CREATE POLICY rbhq_channel_isolation ON public.%I FOR ALL TO authenticated USING (public.rbhq_can_access_channel(%I)) WITH CHECK (public.rbhq_can_access_channel(%I))',
      item.table_name,
      item.channel_column,
      item.channel_column
    );
  END LOOP;
END
$direct_channel_policies$;

ALTER TABLE public.ingested_videos FORCE ROW LEVEL SECURITY;
CREATE POLICY rbhq_ingested_videos_channel_isolation
  ON public.ingested_videos FOR ALL TO authenticated
  USING (
    public.rbhq_is_super_admin() OR EXISTS (
      SELECT 1 FROM public.source_channels AS source
      WHERE source.id = ingested_videos.source_channel_id
        AND public.rbhq_can_access_channel(source.target_rbhq_channel_id)
    )
  )
  WITH CHECK (
    public.rbhq_is_super_admin() OR EXISTS (
      SELECT 1 FROM public.source_channels AS source
      WHERE source.id = ingested_videos.source_channel_id
        AND public.rbhq_can_access_channel(source.target_rbhq_channel_id)
    )
  );

ALTER TABLE public.video_transcripts FORCE ROW LEVEL SECURITY;
CREATE POLICY rbhq_video_transcripts_channel_isolation
  ON public.video_transcripts FOR ALL TO authenticated
  USING (
    public.rbhq_is_super_admin() OR EXISTS (
      SELECT 1
      FROM public.ingested_videos AS video
      JOIN public.source_channels AS source ON source.id = video.source_channel_id
      WHERE video.id = video_transcripts.ingested_video_id
        AND public.rbhq_can_access_channel(source.target_rbhq_channel_id)
    )
  )
  WITH CHECK (
    public.rbhq_is_super_admin() OR EXISTS (
      SELECT 1
      FROM public.ingested_videos AS video
      JOIN public.source_channels AS source ON source.id = video.source_channel_id
      WHERE video.id = video_transcripts.ingested_video_id
        AND public.rbhq_can_access_channel(source.target_rbhq_channel_id)
    )
  );

-- Tables whose tenant is inherited from a post are protected through that post.
DO $post_child_policies$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('publish_jobs', 'clip_id'),
      ('publish_events', 'post_id'),
      ('rbhq_analytics_snapshots', 'post_id')
    ) AS mappings(table_name, post_column)
  LOOP
    IF to_regclass(format('public.%I', item.table_name)) IS NULL OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = item.table_name
        AND column_name = item.post_column
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', item.table_name);
    EXECUTE format(
      'CREATE POLICY rbhq_post_channel_isolation ON public.%I FOR ALL TO authenticated USING (public.rbhq_is_super_admin() OR EXISTS (SELECT 1 FROM public.posts AS post WHERE post.id = %I AND public.rbhq_can_access_channel(post.channel_id))) WITH CHECK (public.rbhq_is_super_admin() OR EXISTS (SELECT 1 FROM public.posts AS post WHERE post.id = %I AND public.rbhq_can_access_channel(post.channel_id)))',
      item.table_name,
      item.post_column,
      item.post_column
    );
  END LOOP;
END
$post_child_policies$;

-- User settings are self-readable/writable; only the server can validate and apply
-- default_channel_id for an operator. Super admins retain support access.
DO $user_settings_policy$
BEGIN
  IF to_regclass('public.user_settings') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.user_settings FORCE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY rbhq_user_settings_isolation ON public.user_settings FOR ALL TO authenticated USING (public.rbhq_is_super_admin() OR user_id = auth.uid()) WITH CHECK (public.rbhq_is_super_admin() OR (user_id = auth.uid() AND public.rbhq_can_access_channel(default_channel_id)))';
  END IF;
END
$user_settings_policy$;

-- Credentials and account ownership are always super-admin-only.
DO $credential_policies$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'social_accounts', 'channel_social_bindings', 'credential_refs',
    'social_credentials', 'publishing_credentials'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    FOR policy_name IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_name, table_name);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY rbhq_super_admin_only ON public.%I FOR ALL TO authenticated USING (public.rbhq_is_super_admin()) WITH CHECK (public.rbhq_is_super_admin())',
      table_name
    );
  END LOOP;
END
$credential_policies$;

REVOKE ALL ON public.operator_channel_assignments FROM anon;
GRANT SELECT ON public.operator_channel_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_channel_assignments TO service_role;
