-- n8n publishing bridge persistence.
-- Safe additive migration. Does not remove Metricool/manual states.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.n8n_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid,
  channel_id uuid,
  webhook_url_present boolean NOT NULL DEFAULT false,
  request_payload jsonb,
  response_status integer,
  response_body jsonb,
  status text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.n8n_handoffs
  ADD COLUMN IF NOT EXISTS clip_id uuid,
  ADD COLUMN IF NOT EXISTS channel_id uuid,
  ADD COLUMN IF NOT EXISTS webhook_url_present boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS request_payload jsonb,
  ADD COLUMN IF NOT EXISTS response_status integer,
  ADD COLUMN IF NOT EXISTS response_body jsonb,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.n8n_handoffs
  DROP CONSTRAINT IF EXISTS n8n_handoffs_status_check;

ALTER TABLE public.n8n_handoffs
  ADD CONSTRAINT n8n_handoffs_status_check
  CHECK (
    status IS NULL OR status IN (
      'sent_to_n8n',
      'n8n_not_configured',
      'n8n_test_mode',
      'n8n_failed'
    )
  )
  NOT VALID;

CREATE INDEX IF NOT EXISTS n8n_handoffs_clip_created_idx
  ON public.n8n_handoffs (clip_id, created_at DESC);

ALTER TABLE public.metricool_handoffs
  DROP CONSTRAINT IF EXISTS metricool_handoffs_publish_status_check;

ALTER TABLE public.metricool_handoffs
  ADD CONSTRAINT metricool_handoffs_publish_status_check
  CHECK (
    publish_status IS NULL OR publish_status IN (
      'draft',
      'ready_for_review',
      'approved',
      'queued',
      'scheduled',
      'published',
      'failed',
      'ready_for_automation',
      'sent_to_n8n',
      'automation_queued',
      'automation_failed',
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

ALTER TABLE public.clips
  DROP CONSTRAINT IF EXISTS clips_publish_status_check;

ALTER TABLE public.clips
  ADD CONSTRAINT clips_publish_status_check
  CHECK (
    publish_status IS NULL OR publish_status IN (
      'draft',
      'ready_for_review',
      'approved',
      'queued',
      'scheduled',
      'published',
      'failed',
      'ready_for_automation',
      'sent_to_n8n',
      'automation_queued',
      'automation_failed',
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
