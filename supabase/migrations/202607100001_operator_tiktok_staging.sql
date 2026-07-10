-- Operator TikTok staging request/result state.
-- Additive only. This is still dry-run/manual-approval flow and never publishes.

ALTER TABLE public.mac_mini_clip_packages
  ADD COLUMN IF NOT EXISTS tiktok_staging_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS tiktok_staging_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS tiktok_staging_requested_by text,
  ADD COLUMN IF NOT EXISTS tiktok_staging_at timestamptz,
  ADD COLUMN IF NOT EXISTS tiktok_staging_error text;

ALTER TABLE public.mac_mini_clip_packages
  DROP CONSTRAINT IF EXISTS mac_mini_clip_packages_tiktok_staging_status_check;

ALTER TABLE public.mac_mini_clip_packages
  ADD CONSTRAINT mac_mini_clip_packages_tiktok_staging_status_check
  CHECK (tiktok_staging_status IN ('not_requested', 'requested', 'ready_for_manual_post', 'blocked', 'failed'));

CREATE INDEX IF NOT EXISTS mac_mini_clip_packages_tiktok_staging_requested_idx
  ON public.mac_mini_clip_packages (tiktok_staging_status, tiktok_staging_requested_at ASC)
  WHERE tiktok_staging_status = 'requested';
