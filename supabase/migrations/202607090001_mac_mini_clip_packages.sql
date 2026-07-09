-- Safe Mac mini clip-package handoff queue.
-- Additive only. Does not upload, schedule, publish, call Metricool, or alter live publish state.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.mac_mini_clip_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_candidate_id uuid NOT NULL REFERENCES public.clip_candidates(id),
  ingested_video_id uuid REFERENCES public.ingested_videos(id),
  target_channel_id uuid,
  lane_label text NOT NULL,
  lane_slug text NOT NULL,
  browser_channel_key text NOT NULL,
  source_url text NOT NULL,
  source_title text NOT NULL,
  source_name text NOT NULL,
  caption text NOT NULL,
  hashtags text[] NOT NULL DEFAULT '{}',
  why_now text NOT NULL,
  hook text NOT NULL,
  operator_summary text NOT NULL,
  edit_notes text[] NOT NULL DEFAULT '{}',
  score numeric,
  score_breakdown jsonb,
  package_payload jsonb NOT NULL,
  package_status text NOT NULL DEFAULT 'ready',
  handoff_status text NOT NULL DEFAULT 'pending',
  worker_id text,
  fetched_at timestamptz,
  dry_run_at timestamptz,
  dry_run_result jsonb,
  dry_run_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clip_candidate_id)
);

ALTER TABLE public.mac_mini_clip_packages
  ADD COLUMN IF NOT EXISTS clip_candidate_id uuid REFERENCES public.clip_candidates(id),
  ADD COLUMN IF NOT EXISTS ingested_video_id uuid REFERENCES public.ingested_videos(id),
  ADD COLUMN IF NOT EXISTS target_channel_id uuid,
  ADD COLUMN IF NOT EXISTS lane_label text,
  ADD COLUMN IF NOT EXISTS lane_slug text,
  ADD COLUMN IF NOT EXISTS browser_channel_key text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_title text,
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS hashtags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS why_now text,
  ADD COLUMN IF NOT EXISTS hook text,
  ADD COLUMN IF NOT EXISTS operator_summary text,
  ADD COLUMN IF NOT EXISTS edit_notes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS package_payload jsonb,
  ADD COLUMN IF NOT EXISTS package_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS handoff_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dry_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS dry_run_result jsonb,
  ADD COLUMN IF NOT EXISTS dry_run_error text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.mac_mini_clip_packages
  DROP CONSTRAINT IF EXISTS mac_mini_clip_packages_package_status_check;

ALTER TABLE public.mac_mini_clip_packages
  ADD CONSTRAINT mac_mini_clip_packages_package_status_check
  CHECK (package_status IN ('ready', 'fetched', 'dry_run_complete', 'dry_run_failed', 'cancelled'));

ALTER TABLE public.mac_mini_clip_packages
  DROP CONSTRAINT IF EXISTS mac_mini_clip_packages_handoff_status_check;

ALTER TABLE public.mac_mini_clip_packages
  ADD CONSTRAINT mac_mini_clip_packages_handoff_status_check
  CHECK (handoff_status IN ('pending', 'fetched', 'dry_run_succeeded', 'dry_run_failed', 'cancelled'));

CREATE UNIQUE INDEX IF NOT EXISTS mac_mini_clip_packages_candidate_key
  ON public.mac_mini_clip_packages (clip_candidate_id);

CREATE INDEX IF NOT EXISTS mac_mini_clip_packages_pending_idx
  ON public.mac_mini_clip_packages (package_status, handoff_status, created_at DESC);

CREATE INDEX IF NOT EXISTS mac_mini_clip_packages_target_channel_idx
  ON public.mac_mini_clip_packages (target_channel_id);
