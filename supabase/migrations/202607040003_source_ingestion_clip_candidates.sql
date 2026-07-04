-- Source ingestion and clip candidate scout foundation.
-- Additive only. Does not publish, remove Metricool, or alter existing approval gates.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.source_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  platform text NOT NULL DEFAULT 'youtube',
  source_url text,
  rss_url text NOT NULL,
  target_rbhq_channel_id uuid,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.source_channels
  ADD COLUMN IF NOT EXISTS channel_key text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'youtube',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS rss_url text,
  ADD COLUMN IF NOT EXISTS target_rbhq_channel_id uuid,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.ingested_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_channel_id uuid REFERENCES public.source_channels(id),
  external_video_id text NOT NULL,
  platform text NOT NULL DEFAULT 'youtube',
  title text NOT NULL,
  description text,
  video_url text NOT NULL,
  thumbnail_url text,
  published_at timestamptz,
  duration_seconds integer,
  ingest_status text NOT NULL DEFAULT 'ingested',
  raw_feed_entry jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_video_id)
);

ALTER TABLE public.ingested_videos
  ADD COLUMN IF NOT EXISTS source_channel_id uuid REFERENCES public.source_channels(id),
  ADD COLUMN IF NOT EXISTS external_video_id text,
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'youtube',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS ingest_status text NOT NULL DEFAULT 'ingested',
  ADD COLUMN IF NOT EXISTS raw_feed_entry jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.video_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingested_video_id uuid NOT NULL REFERENCES public.ingested_videos(id),
  transcript_source text NOT NULL,
  transcript_text text,
  transcript_json jsonb,
  language text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_transcripts
  ADD COLUMN IF NOT EXISTS ingested_video_id uuid REFERENCES public.ingested_videos(id),
  ADD COLUMN IF NOT EXISTS transcript_source text,
  ADD COLUMN IF NOT EXISTS transcript_text text,
  ADD COLUMN IF NOT EXISTS transcript_json jsonb,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.clip_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingested_video_id uuid NOT NULL REFERENCES public.ingested_videos(id),
  target_channel_id uuid,
  start_seconds numeric,
  end_seconds numeric,
  title text NOT NULL,
  summary text,
  hook_text text,
  caption text,
  hashtags text[],
  score numeric,
  score_breakdown jsonb,
  status text NOT NULL DEFAULT 'candidate',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clip_candidates
  ADD COLUMN IF NOT EXISTS ingested_video_id uuid REFERENCES public.ingested_videos(id),
  ADD COLUMN IF NOT EXISTS target_channel_id uuid,
  ADD COLUMN IF NOT EXISTS start_seconds numeric,
  ADD COLUMN IF NOT EXISTS end_seconds numeric,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS hook_text text,
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS hashtags text[],
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'candidate',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS source_channels_channel_key_key
  ON public.source_channels (channel_key);

CREATE INDEX IF NOT EXISTS source_channels_channel_key_idx
  ON public.source_channels (channel_key);

CREATE INDEX IF NOT EXISTS source_channels_enabled_idx
  ON public.source_channels (enabled);

CREATE UNIQUE INDEX IF NOT EXISTS ingested_videos_platform_external_video_id_key
  ON public.ingested_videos (platform, external_video_id);

CREATE INDEX IF NOT EXISTS ingested_videos_source_channel_id_idx
  ON public.ingested_videos (source_channel_id);

CREATE INDEX IF NOT EXISTS ingested_videos_platform_external_video_id_idx
  ON public.ingested_videos (platform, external_video_id);

CREATE INDEX IF NOT EXISTS ingested_videos_published_at_desc_idx
  ON public.ingested_videos (published_at DESC);

CREATE INDEX IF NOT EXISTS video_transcripts_ingested_video_id_idx
  ON public.video_transcripts (ingested_video_id);

CREATE INDEX IF NOT EXISTS clip_candidates_ingested_video_id_idx
  ON public.clip_candidates (ingested_video_id);

CREATE INDEX IF NOT EXISTS clip_candidates_status_idx
  ON public.clip_candidates (status);

CREATE INDEX IF NOT EXISTS clip_candidates_score_desc_idx
  ON public.clip_candidates (score DESC);

CREATE INDEX IF NOT EXISTS clip_candidates_created_at_desc_idx
  ON public.clip_candidates (created_at DESC);
