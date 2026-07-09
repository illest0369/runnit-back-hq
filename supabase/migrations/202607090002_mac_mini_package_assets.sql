-- Safe local asset attachment fields for Mac mini clip packages.
-- Additive only. Does not upload, schedule, publish, call Metricool, or alter live publish state.

ALTER TABLE public.mac_mini_clip_packages
  ADD COLUMN IF NOT EXISTS local_asset_path text,
  ADD COLUMN IF NOT EXISTS asset_status text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS asset_error text,
  ADD COLUMN IF NOT EXISTS asset_attached_at timestamptz;

ALTER TABLE public.mac_mini_clip_packages
  DROP CONSTRAINT IF EXISTS mac_mini_clip_packages_asset_status_check;

ALTER TABLE public.mac_mini_clip_packages
  ADD CONSTRAINT mac_mini_clip_packages_asset_status_check
  CHECK (asset_status IN ('missing', 'attached', 'invalid'));

CREATE INDEX IF NOT EXISTS mac_mini_clip_packages_asset_status_idx
  ON public.mac_mini_clip_packages (asset_status, created_at DESC);
