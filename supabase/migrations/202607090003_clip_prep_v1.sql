-- Clip Prep V1 metadata for manual Mac mini package QA.
-- Additive only. Does not download, render, upload, schedule, publish, call Metricool, or alter live publish state.

ALTER TABLE public.clip_candidates
  ADD COLUMN IF NOT EXISTS suggested_clip_start_seconds numeric,
  ADD COLUMN IF NOT EXISTS suggested_clip_end_seconds numeric,
  ADD COLUMN IF NOT EXISTS suggested_clip_length_seconds numeric,
  ADD COLUMN IF NOT EXISTS clip_reason text,
  ADD COLUMN IF NOT EXISTS opening_text text,
  ADD COLUMN IF NOT EXISTS edit_notes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS asset_instructions text,
  ADD COLUMN IF NOT EXISTS clip_prep_status text NOT NULL DEFAULT 'metadata_only',
  ADD COLUMN IF NOT EXISTS clip_prep_confidence text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS clip_prep jsonb;

ALTER TABLE public.clip_candidates
  DROP CONSTRAINT IF EXISTS clip_candidates_clip_prep_status_check;

ALTER TABLE public.clip_candidates
  ADD CONSTRAINT clip_candidates_clip_prep_status_check
  CHECK (clip_prep_status IN ('ready', 'metadata_only'));

ALTER TABLE public.clip_candidates
  DROP CONSTRAINT IF EXISTS clip_candidates_clip_prep_confidence_check;

ALTER TABLE public.clip_candidates
  ADD CONSTRAINT clip_candidates_clip_prep_confidence_check
  CHECK (clip_prep_confidence IN ('high', 'medium', 'low'));

CREATE INDEX IF NOT EXISTS clip_candidates_clip_prep_status_idx
  ON public.clip_candidates (clip_prep_status, updated_at DESC);
