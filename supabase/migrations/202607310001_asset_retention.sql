-- Durable platform asset retention metadata.
-- Additive only. Does not delete assets, schedule posts, call Metricool, or alter live publish state.

ALTER TABLE public.clips
  ADD COLUMN IF NOT EXISTS asset_storage_provider text,
  ADD COLUMN IF NOT EXISTS asset_storage_key text,
  ADD COLUMN IF NOT EXISTS asset_public_url text,
  ADD COLUMN IF NOT EXISTS asset_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS asset_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS asset_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS asset_delete_status text,
  ADD COLUMN IF NOT EXISTS asset_delete_error text;

ALTER TABLE public.mac_mini_clip_packages
  ADD COLUMN IF NOT EXISTS asset_storage_provider text,
  ADD COLUMN IF NOT EXISTS asset_storage_key text,
  ADD COLUMN IF NOT EXISTS asset_public_url text,
  ADD COLUMN IF NOT EXISTS asset_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS asset_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS asset_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS asset_delete_status text,
  ADD COLUMN IF NOT EXISTS asset_delete_error text;

ALTER TABLE public.clips
  DROP CONSTRAINT IF EXISTS clips_asset_storage_provider_check;

ALTER TABLE public.clips
  ADD CONSTRAINT clips_asset_storage_provider_check
  CHECK (asset_storage_provider IS NULL OR asset_storage_provider IN ('r2', 'local_dev'))
  NOT VALID;

ALTER TABLE public.mac_mini_clip_packages
  DROP CONSTRAINT IF EXISTS mac_mini_clip_packages_asset_storage_provider_check;

ALTER TABLE public.mac_mini_clip_packages
  ADD CONSTRAINT mac_mini_clip_packages_asset_storage_provider_check
  CHECK (asset_storage_provider IS NULL OR asset_storage_provider IN ('r2', 'local_dev'))
  NOT VALID;

ALTER TABLE public.clips
  DROP CONSTRAINT IF EXISTS clips_asset_delete_status_check;

ALTER TABLE public.clips
  ADD CONSTRAINT clips_asset_delete_status_check
  CHECK (
    asset_delete_status IS NULL OR asset_delete_status IN (
      'pending',
      'deleted',
      'failed',
      'skipped_pending_publish',
      'skipped_local_dev',
      'skipped_missing_storage_key'
    )
  )
  NOT VALID;

ALTER TABLE public.mac_mini_clip_packages
  DROP CONSTRAINT IF EXISTS mac_mini_clip_packages_asset_delete_status_check;

ALTER TABLE public.mac_mini_clip_packages
  ADD CONSTRAINT mac_mini_clip_packages_asset_delete_status_check
  CHECK (
    asset_delete_status IS NULL OR asset_delete_status IN (
      'pending',
      'deleted',
      'failed',
      'skipped_pending_publish',
      'skipped_local_dev',
      'skipped_missing_storage_key'
    )
  )
  NOT VALID;

CREATE INDEX IF NOT EXISTS clips_asset_expiry_idx
  ON public.clips (asset_expires_at)
  WHERE asset_expires_at IS NOT NULL AND asset_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS clips_asset_storage_key_idx
  ON public.clips (asset_storage_key)
  WHERE asset_storage_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS mac_mini_clip_packages_asset_expiry_idx
  ON public.mac_mini_clip_packages (asset_expires_at)
  WHERE asset_expires_at IS NOT NULL AND asset_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS mac_mini_clip_packages_asset_storage_key_idx
  ON public.mac_mini_clip_packages (asset_storage_key)
  WHERE asset_storage_key IS NOT NULL;
