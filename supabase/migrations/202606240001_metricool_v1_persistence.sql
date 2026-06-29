-- Metricool V1 persistence hardening.
-- Safe to run once in production and safe if the table/columns already exist.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.metricool_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid,
  channel_id uuid,
  brand_id text,
  endpoint text,
  request_payload jsonb,
  response_status integer,
  response_body jsonb,
  metricool_post_id text,
  status text,
  publish_status text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.metricool_handoffs
  ADD COLUMN IF NOT EXISTS clip_id uuid,
  ADD COLUMN IF NOT EXISTS channel_id uuid,
  ADD COLUMN IF NOT EXISTS brand_id text,
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS request_payload jsonb,
  ADD COLUMN IF NOT EXISTS response_status integer,
  ADD COLUMN IF NOT EXISTS response_body jsonb,
  ADD COLUMN IF NOT EXISTS metricool_post_id text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS publish_status text,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.metricool_handoffs
  DROP CONSTRAINT IF EXISTS metricool_handoffs_status_check;

ALTER TABLE public.metricool_handoffs
  ADD CONSTRAINT metricool_handoffs_status_check
  CHECK (status IS NULL OR status IN ('skipped', 'accepted', 'failed'))
  NOT VALID;

ALTER TABLE public.metricool_handoffs
  DROP CONSTRAINT IF EXISTS metricool_handoffs_publish_status_check;

ALTER TABLE public.metricool_handoffs
  ADD CONSTRAINT metricool_handoffs_publish_status_check
  CHECK (
    publish_status IS NULL OR publish_status IN (
      'not_ready',
      'needs_clip_render',
      'render_failed',
      'ready_for_manual_publish',
      'manually_published',
      'metricool_ready_manual_export',
      'metricool_scheduled',
      'metricool_published',
      'metricool_failed'
    )
  )
  NOT VALID;

CREATE INDEX IF NOT EXISTS metricool_handoffs_clip_created_idx
  ON public.metricool_handoffs (clip_id, created_at DESC);

ALTER TABLE public.clips
  DROP CONSTRAINT IF EXISTS clips_publish_status_check;

ALTER TABLE public.clips
  ADD CONSTRAINT clips_publish_status_check
  CHECK (
    publish_status IS NULL OR publish_status IN (
      'not_ready',
      'needs_clip_render',
      'render_failed',
      'ready_for_manual_publish',
      'manually_published',
      'metricool_ready_manual_export',
      'metricool_scheduled',
      'metricool_published',
      'metricool_failed'
    )
  )
  NOT VALID;
