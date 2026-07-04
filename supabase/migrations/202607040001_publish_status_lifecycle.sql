-- Non-destructive lifecycle expansion for RBHQ publishing.
-- Keeps existing Metricool/manual statuses while allowing the product-level V1 lifecycle.

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
