


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."rbhq_workflow_state" AS ENUM (
    'INGESTED',
    'SCORING',
    'READY_FOR_CLIP_APPROVAL',
    'CLIP_APPROVED',
    'READY_FOR_POST_APPROVAL',
    'POST_APPROVED',
    'POSTING',
    'POSTED',
    'ANALYTICS_SYNCED',
    'FAILED'
);


ALTER TYPE "public"."rbhq_workflow_state" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_clip_source_counts"("target_source_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  if target_source_id is null then
    return;
  end if;

  update clip_sources
  set
    pending_count = counts.pending_count,
    approved_count = counts.approved_count,
    rejected_count = counts.rejected_count,
    manually_published_count = counts.manually_published_count,
    total_imported = counts.total_imported,
    last_ingested_at = counts.last_ingested_at
  from (
    select
      count(*) filter (where status = 'pending')::integer as pending_count,
      count(*) filter (where status = 'approved')::integer as approved_count,
      count(*) filter (where status = 'rejected')::integer as rejected_count,
      count(*) filter (where publish_status = 'manually_published')::integer as manually_published_count,
      count(*)::integer as total_imported,
      max(ingested_at) as last_ingested_at
    from clips
    where source_id = target_source_id
  ) as counts
  where clip_sources.id = target_source_id;
end;
$$;


ALTER FUNCTION "public"."refresh_clip_source_counts"("target_source_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_clip_source_counts_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  perform refresh_clip_source_counts(coalesce(new.source_id, old.source_id));

  if tg_op = 'UPDATE' and old.source_id is distinct from new.source_id then
    perform refresh_clip_source_counts(old.source_id);
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."refresh_clip_source_counts_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_clip_sources_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_clip_sources_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_clips_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_clips_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."channel_programming" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "tone" "text",
    "clip_types_allowed" "text"[] DEFAULT '{}'::"text"[],
    "clip_types_blocked" "text"[] DEFAULT '{}'::"text"[],
    "posting_cadence_daily" integer DEFAULT 3,
    "min_score_threshold" numeric DEFAULT 60,
    "scoring_weights" "jsonb" DEFAULT '{}'::"jsonb",
    "packaging_preset" "jsonb" DEFAULT '{}'::"jsonb",
    "narrative_tags" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."channel_programming" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channel_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "list_type" "text" DEFAULT 'whitelist'::"text" NOT NULL,
    "priority" integer DEFAULT 50 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "channel_sources_list_type_check" CHECK (("list_type" = ANY (ARRAY['whitelist'::"text", 'blacklist'::"text"])))
);


ALTER TABLE "public"."channel_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "handle" "text" NOT NULL,
    "category" "text" NOT NULL,
    "system_prompt" "text",
    "tiktok_token" "text",
    "tiktok_refresh_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tiktok_handle" "text",
    "tiktok_user_id" "text",
    "tiktok_expires_at" timestamp with time zone,
    "buffer_profile_id" "text",
    "niche" "text",
    "tiktok_profile_url" "text",
    "status" "text" DEFAULT 'active'::"text",
    CONSTRAINT "channels_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'archived'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clip_candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ingested_video_id" "uuid" NOT NULL,
    "target_channel_id" "uuid",
    "start_seconds" numeric,
    "end_seconds" numeric,
    "title" "text" NOT NULL,
    "summary" "text",
    "hook_text" "text",
    "caption" "text",
    "hashtags" "text"[],
    "score" numeric,
    "score_breakdown" "jsonb",
    "status" "text" DEFAULT 'candidate'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "suggested_clip_start_seconds" numeric,
    "suggested_clip_end_seconds" numeric,
    "suggested_clip_length_seconds" numeric,
    "clip_reason" "text",
    "opening_text" "text",
    "edit_notes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "asset_instructions" "text",
    "clip_prep_status" "text" DEFAULT 'metadata_only'::"text" NOT NULL,
    "clip_prep_confidence" "text" DEFAULT 'low'::"text" NOT NULL,
    "clip_prep" "jsonb",
    CONSTRAINT "clip_candidates_clip_prep_confidence_check" CHECK (("clip_prep_confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "clip_candidates_clip_prep_status_check" CHECK (("clip_prep_status" = ANY (ARRAY['ready'::"text", 'metadata_only'::"text"])))
);


ALTER TABLE "public"."clip_candidates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clip_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_name" "text" NOT NULL,
    "source_type" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "source_url" "text",
    "original_platform" "text",
    "active" boolean DEFAULT true NOT NULL,
    "pending_count" integer DEFAULT 0 NOT NULL,
    "approved_count" integer DEFAULT 0 NOT NULL,
    "rejected_count" integer DEFAULT 0 NOT NULL,
    "manually_published_count" integer DEFAULT 0 NOT NULL,
    "total_imported" integer DEFAULT 0 NOT NULL,
    "last_ingested_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clip_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_id" "uuid",
    "external_id" "text",
    "title" "text" NOT NULL,
    "hook" "text" NOT NULL,
    "source_name" "text" NOT NULL,
    "source_type" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "thumbnail_url" "text",
    "video_url" "text" NOT NULL,
    "source_url" "text",
    "original_platform" "text",
    "import_batch_id" "text",
    "aspect_ratio" "text",
    "duration_seconds" numeric,
    "ai_score" numeric DEFAULT 0 NOT NULL,
    "virality_score" numeric,
    "hook_strength" numeric,
    "emotion" "text",
    "sports_category" "text",
    "recommended_hook" "text",
    "moderation_notes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "risk_flags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "gemini_processed_at" timestamp with time zone,
    "sport" "text",
    "league" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "publish_status" "text" DEFAULT 'not_ready'::"text" NOT NULL,
    "approved_at" timestamp with time zone,
    "manually_published_at" timestamp with time zone,
    "analytics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "comments" integer DEFAULT 0 NOT NULL,
    "shares" integer DEFAULT 0 NOT NULL,
    "saves" integer DEFAULT 0 NOT NULL,
    "watch_time_seconds" numeric DEFAULT 0 NOT NULL,
    "last_analytics_at" timestamp with time zone,
    "ingested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ingestion_status" "text" DEFAULT 'imported'::"text" NOT NULL,
    "ingestion_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "channel_id" "uuid",
    "asset_storage_provider" "text",
    "asset_storage_key" "text",
    "asset_public_url" "text",
    "asset_created_at" timestamp with time zone,
    "asset_expires_at" timestamp with time zone,
    "asset_deleted_at" timestamp with time zone,
    "asset_delete_status" "text",
    "asset_delete_error" "text",
    CONSTRAINT "clips_ai_score_range_check" CHECK ((("ai_score" >= (0)::numeric) AND ("ai_score" <= (100)::numeric))),
    CONSTRAINT "clips_hook_strength_range_check" CHECK ((("hook_strength" IS NULL) OR (("hook_strength" >= (0)::numeric) AND ("hook_strength" <= (100)::numeric)))),
    CONSTRAINT "clips_ingestion_status_check" CHECK (("ingestion_status" = ANY (ARRAY['imported'::"text", 'processing'::"text", 'processed'::"text", 'failed'::"text", 'skipped'::"text", 'discovered'::"text", 'enriched'::"text", 'scored'::"text", 'approved'::"text", 'exported'::"text", 'published'::"text"]))),
    CONSTRAINT "clips_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'skipped'::"text"]))),
    CONSTRAINT "clips_virality_score_range_check" CHECK ((("virality_score" IS NULL) OR (("virality_score" >= (0)::numeric) AND ("virality_score" <= (100)::numeric))))
);


ALTER TABLE "public"."clips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "tiktok_comment_id" "text",
    "tiktok_post_id" "text",
    "username" "text",
    "text" "text",
    "like_count" integer DEFAULT 0,
    "replied" boolean DEFAULT false,
    "reply_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingested_videos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_channel_id" "uuid",
    "external_video_id" "text" NOT NULL,
    "platform" "text" DEFAULT 'youtube'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "video_url" "text" NOT NULL,
    "thumbnail_url" "text",
    "published_at" timestamp with time zone,
    "duration_seconds" integer,
    "ingest_status" "text" DEFAULT 'ingested'::"text" NOT NULL,
    "raw_feed_entry" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ingested_videos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_weights" (
    "reply_type" "text" NOT NULL,
    "weight" numeric DEFAULT 1 NOT NULL,
    "total_score" numeric DEFAULT 0 NOT NULL,
    "sample_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."learning_weights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mac_mini_clip_packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clip_candidate_id" "uuid" NOT NULL,
    "ingested_video_id" "uuid",
    "target_channel_id" "uuid",
    "lane_label" "text" NOT NULL,
    "lane_slug" "text" NOT NULL,
    "browser_channel_key" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "source_title" "text" NOT NULL,
    "source_name" "text" NOT NULL,
    "caption" "text" NOT NULL,
    "hashtags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "why_now" "text" NOT NULL,
    "hook" "text" NOT NULL,
    "operator_summary" "text" NOT NULL,
    "edit_notes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "score" numeric,
    "score_breakdown" "jsonb",
    "package_payload" "jsonb" NOT NULL,
    "package_status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "handoff_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "worker_id" "text",
    "fetched_at" timestamp with time zone,
    "dry_run_at" timestamp with time zone,
    "dry_run_result" "jsonb",
    "dry_run_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "local_asset_path" "text",
    "asset_status" "text" DEFAULT 'missing'::"text" NOT NULL,
    "asset_error" "text",
    "asset_attached_at" timestamp with time zone,
    "tiktok_staging_status" "text" DEFAULT 'not_requested'::"text" NOT NULL,
    "tiktok_staging_requested_at" timestamp with time zone,
    "tiktok_staging_requested_by" "text",
    "tiktok_staging_at" timestamp with time zone,
    "tiktok_staging_error" "text",
    "asset_storage_provider" "text",
    "asset_storage_key" "text",
    "asset_public_url" "text",
    "asset_created_at" timestamp with time zone,
    "asset_expires_at" timestamp with time zone,
    "asset_deleted_at" timestamp with time zone,
    "asset_delete_status" "text",
    "asset_delete_error" "text",
    CONSTRAINT "mac_mini_clip_packages_asset_status_check" CHECK (("asset_status" = ANY (ARRAY['missing'::"text", 'attached'::"text", 'invalid'::"text"]))),
    CONSTRAINT "mac_mini_clip_packages_handoff_status_check" CHECK (("handoff_status" = ANY (ARRAY['pending'::"text", 'fetched'::"text", 'dry_run_succeeded'::"text", 'dry_run_failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "mac_mini_clip_packages_package_status_check" CHECK (("package_status" = ANY (ARRAY['ready'::"text", 'fetched'::"text", 'dry_run_complete'::"text", 'dry_run_failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "mac_mini_clip_packages_tiktok_staging_status_check" CHECK (("tiktok_staging_status" = ANY (ARRAY['not_requested'::"text", 'requested'::"text", 'ready_for_manual_post'::"text", 'blocked'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."mac_mini_clip_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."metricool_handoffs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clip_id" "uuid",
    "channel_id" "uuid",
    "brand_id" "text",
    "endpoint" "text",
    "request_payload" "jsonb",
    "response_status" integer,
    "response_body" "jsonb",
    "metricool_post_id" "text",
    "status" "text",
    "publish_status" "text",
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."metricool_handoffs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moderation_actions" (
    "id" bigint NOT NULL,
    "post_id" "text" NOT NULL,
    "operator" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "action" "text" NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "cdn_url" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "moderation_actions_action_check" CHECK (("action" = ANY (ARRAY['approve'::"text", 'reject'::"text"])))
);


ALTER TABLE "public"."moderation_actions" OWNER TO "postgres";


ALTER TABLE "public"."moderation_actions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."moderation_actions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."n8n_handoffs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clip_id" "uuid",
    "channel_id" "uuid",
    "webhook_url_present" boolean DEFAULT false NOT NULL,
    "request_payload" "jsonb",
    "response_status" integer,
    "response_body" "jsonb",
    "status" "text",
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."n8n_handoffs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "type" "text" NOT NULL,
    "post_id" "text" NOT NULL,
    "operator" "text" NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "cdn_url" "text" DEFAULT ''::"text" NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['approved'::"text", 'rejected'::"text", 'scored'::"text", 'duplicate'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "clip_url" "text",
    "caption" "text",
    "hook" "text",
    "tiktok_post_id" "text",
    "posted_at" timestamp with time zone DEFAULT "now"(),
    "tiktok_post_url" "text",
    "job_id" "uuid"
);


ALTER TABLE "public"."post_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clip_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "platform" "text" NOT NULL,
    "destination" "text" DEFAULT 'manual'::"text" NOT NULL,
    "caption" "text" DEFAULT ''::"text" NOT NULL,
    "video_url" "text" NOT NULL,
    "scheduled_time" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "channel_id" "uuid",
    "hook" "text" DEFAULT ''::"text" NOT NULL,
    "hashtags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "score" numeric DEFAULT 0 NOT NULL,
    "comment_count_hint" integer DEFAULT 0 NOT NULL,
    "priority_score" numeric DEFAULT 0 NOT NULL,
    "thumbnail_url" "text",
    "tiktok_url" "text",
    "source_video_url" "text",
    "hook_options" "text"[],
    "start_time" numeric,
    "end_time" numeric,
    "reply_type" "text",
    "comment_bait" "jsonb",
    "brand_fit" numeric DEFAULT 0,
    "watchability" numeric DEFAULT 0,
    "monetization_safety" numeric DEFAULT 0,
    "replay_value" numeric DEFAULT 0,
    "discussion_potential" numeric DEFAULT 0,
    "urgency_score" numeric DEFAULT 0,
    "evergreen_value" numeric DEFAULT 0,
    "review_status" "text" DEFAULT 'needs_review'::"text",
    "duplicate_hash" "text",
    "monetization_risk" "text" DEFAULT 'low'::"text",
    "timeliness" "text" DEFAULT 'standard'::"text",
    "evergreen_flag" boolean DEFAULT false,
    "crop_viable_9x16" boolean DEFAULT true,
    "clip_type" "text",
    "tone" "text",
    "sport" "text",
    "league" "text",
    "athlete" "text",
    "creator" "text",
    "source_name" "text",
    "source_tier" "text" DEFAULT 'tier_2'::"text",
    CONSTRAINT "posts_destination_check" CHECK (("destination" = ANY (ARRAY['tiktok_direct'::"text", 'buffer'::"text", 'manual'::"text"]))),
    CONSTRAINT "posts_platform_check" CHECK (("platform" = 'tiktok'::"text")),
    CONSTRAINT "posts_status_check" CHECK (("status" = ANY (ARRAY['SOURCED'::"text", 'SELECTED'::"text", 'GENERATED'::"text", 'GUARDED'::"text", 'REVIEWED'::"text", 'AI_DECISION'::"text", 'APPROVED_BY_HUMAN'::"text", 'EXECUTED'::"text", 'REJECTED'::"text", 'FAILED'::"text", 'REVISE'::"text", 'queued'::"text", 'needs_review'::"text", 'approved'::"text", 'rejected'::"text", 'sent_to_buffer'::"text", 'ready_to_post'::"text", 'sent_to_publish'::"text", 'publishing'::"text", 'posted'::"text", 'processed'::"text", 'failed'::"text", 'ready'::"text"])))
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."publish_log" (
    "id" bigint NOT NULL,
    "post_id" "text" NOT NULL,
    "operator" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "approved_by" "text" NOT NULL,
    "cdn_url" "text" DEFAULT ''::"text" NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "published_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."publish_log" OWNER TO "postgres";


ALTER TABLE "public"."publish_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."publish_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."publish_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "step" "text" NOT NULL,
    "status" "text" NOT NULL,
    "response" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "publish_logs_step_check" CHECK (("step" = ANY (ARRAY['route'::"text", 'buffer_send'::"text", 'complete'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."publish_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."queue_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "source_url" "text",
    "clip_url" "text",
    "score" numeric,
    "status" "text" DEFAULT 'pending'::"text",
    "post_package" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."queue_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rbhq_analytics_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "comments" integer DEFAULT 0 NOT NULL,
    "shares" integer DEFAULT 0 NOT NULL,
    "retention" numeric,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "collected_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rbhq_analytics_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rbhq_clip_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clip_id" "uuid" NOT NULL,
    "virality_score" numeric NOT NULL,
    "hook_strength" numeric NOT NULL,
    "controversy_score" numeric NOT NULL,
    "sports_category" "text" NOT NULL,
    "emotion" "text" NOT NULL,
    "recommended_hook" "text" NOT NULL,
    "risk_flags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "raw_response" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rbhq_clip_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rbhq_clips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_item_id" "uuid" NOT NULL,
    "r2_key" "text",
    "video_url" "text",
    "thumbnail_url" "text",
    "start_time" numeric,
    "end_time" numeric,
    "duration_seconds" numeric,
    "workflow_state" "public"."rbhq_workflow_state" DEFAULT 'INGESTED'::"public"."rbhq_workflow_state" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rbhq_clips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rbhq_operator_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operator_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "from_state" "public"."rbhq_workflow_state",
    "to_state" "public"."rbhq_workflow_state" NOT NULL,
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rbhq_operator_actions_action_check" CHECK (("action" = ANY (ARRAY['approve_clip'::"text", 'reject_clip'::"text", 'approve_post'::"text", 'reject_post'::"text"]))),
    CONSTRAINT "rbhq_operator_actions_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['clip'::"text", 'post'::"text"])))
);


ALTER TABLE "public"."rbhq_operator_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rbhq_posted_clips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "clip_id" "uuid" NOT NULL,
    "platform" "text" DEFAULT 'tiktok'::"text" NOT NULL,
    "platform_post_id" "text" NOT NULL,
    "posted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "rbhq_posted_clips_platform_check" CHECK (("platform" = 'tiktok'::"text"))
);


ALTER TABLE "public"."rbhq_posted_clips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rbhq_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clip_id" "uuid" NOT NULL,
    "caption" "text",
    "hook" "text",
    "platform" "text" DEFAULT 'tiktok'::"text" NOT NULL,
    "platform_post_id" "text",
    "workflow_state" "public"."rbhq_workflow_state" DEFAULT 'READY_FOR_POST_APPROVAL'::"public"."rbhq_workflow_state" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "posted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rbhq_posts_platform_check" CHECK (("platform" = 'tiktok'::"text"))
);


ALTER TABLE "public"."rbhq_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rbhq_source_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_platform" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "source_external_id" "text",
    "title" "text" NOT NULL,
    "creator" "text",
    "duration_seconds" integer,
    "views" integer DEFAULT 0 NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "comments" integer DEFAULT 0 NOT NULL,
    "upload_date" timestamp with time zone,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "workflow_state" "public"."rbhq_workflow_state" DEFAULT 'INGESTED'::"public"."rbhq_workflow_state" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ingestion_status" "text" DEFAULT 'discovered'::"text" NOT NULL,
    CONSTRAINT "rbhq_source_items_ingestion_status_check" CHECK (("ingestion_status" = ANY (ARRAY['discovered'::"text", 'enriched'::"text", 'scored'::"text", 'approved'::"text", 'exported'::"text", 'published'::"text"]))),
    CONSTRAINT "rbhq_source_items_source_platform_check" CHECK (("source_platform" = ANY (ARRAY['youtube'::"text", 'tiktok'::"text", 'instagram'::"text", 'reddit'::"text"])))
);


ALTER TABLE "public"."rbhq_source_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rbhq_workflow_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "from_state" "public"."rbhq_workflow_state",
    "to_state" "public"."rbhq_workflow_state" NOT NULL,
    "actor_type" "text" NOT NULL,
    "operator_id" "uuid",
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rbhq_workflow_events_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['system'::"text", 'worker'::"text", 'operator'::"text", 'admin'::"text"]))),
    CONSTRAINT "rbhq_workflow_events_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['source_item'::"text", 'clip'::"text", 'post'::"text"])))
);


ALTER TABLE "public"."rbhq_workflow_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reply_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reply_session_id" "uuid" NOT NULL,
    "outcome_type" "text" DEFAULT 'replied'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reply_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reply_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "comment_text" "text" DEFAULT ''::"text" NOT NULL,
    "comment_type" "text" DEFAULT 'neutral'::"text" NOT NULL,
    "priority_score" integer DEFAULT 0 NOT NULL,
    "generated_suggestions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "final_reply_text" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reply_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "access_token" "text",
    "refresh_token" "text",
    "expires_at" timestamp with time zone,
    "is_approved" boolean DEFAULT false NOT NULL,
    "buffer_profile_id" "text",
    "buffer_connected" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_accounts_platform_check" CHECK (("platform" = 'tiktok'::"text"))
);


ALTER TABLE "public"."social_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."source_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_key" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "platform" "text" DEFAULT 'youtube'::"text" NOT NULL,
    "source_url" "text",
    "rss_url" "text" NOT NULL,
    "target_rbhq_channel_id" "uuid",
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."source_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "category" "text",
    "active" boolean DEFAULT true,
    "added_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text",
    "handle" "text",
    "tier" "text" DEFAULT 'tier_2'::"text",
    "status" "text" DEFAULT 'active'::"text",
    "auto_ingest" boolean DEFAULT true,
    "notes" "text",
    "last_ingested_at" timestamp with time zone,
    "last_run_at" timestamp with time zone,
    "videos_enqueued" integer DEFAULT 0 NOT NULL,
    "success_rate" numeric DEFAULT 0 NOT NULL,
    "ingest_limit" integer DEFAULT 8 NOT NULL,
    "cadence_per_day" integer DEFAULT 2 NOT NULL,
    CONSTRAINT "sources_platform_check" CHECK (("platform" = ANY (ARRAY['youtube'::"text", 'tiktok'::"text", 'instagram'::"text", 'reddit'::"text", 'direct'::"text"])))
);


ALTER TABLE "public"."sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "can_post" boolean DEFAULT true,
    "is_primary" boolean DEFAULT false
);


ALTER TABLE "public"."user_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "default_channel_id" "uuid",
    "notifications_enabled" boolean DEFAULT true NOT NULL,
    "view_preference" "text" DEFAULT 'compact'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_settings_view_preference_check" CHECK (("view_preference" = ANY (ARRAY['compact'::"text", 'comfortable'::"text"])))
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text" NOT NULL,
    "pin_hash" "text" NOT NULL,
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_transcripts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ingested_video_id" "uuid" NOT NULL,
    "transcript_source" "text" NOT NULL,
    "transcript_text" "text",
    "transcript_json" "jsonb",
    "language" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."video_transcripts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."war_room_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clip_id" "uuid",
    "post_id" "uuid",
    "stage" "text" NOT NULL,
    "actor" "text" NOT NULL,
    "decision" "text",
    "from_state" "text",
    "to_state" "text",
    "reason" "text",
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."war_room_audit_logs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."channel_programming"
    ADD CONSTRAINT "channel_programming_channel_id_key" UNIQUE ("channel_id");



ALTER TABLE ONLY "public"."channel_programming"
    ADD CONSTRAINT "channel_programming_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channel_sources"
    ADD CONSTRAINT "channel_sources_channel_id_source_id_key" UNIQUE ("channel_id", "source_id");



ALTER TABLE ONLY "public"."channel_sources"
    ADD CONSTRAINT "channel_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_handle_key" UNIQUE ("handle");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clip_candidates"
    ADD CONSTRAINT "clip_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clip_sources"
    ADD CONSTRAINT "clip_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clip_sources"
    ADD CONSTRAINT "clip_sources_source_name_source_type_key" UNIQUE ("source_name", "source_type");



ALTER TABLE "public"."clips"
    ADD CONSTRAINT "clips_asset_delete_status_check" CHECK ((("asset_delete_status" IS NULL) OR ("asset_delete_status" = ANY (ARRAY['pending'::"text", 'deleted'::"text", 'failed'::"text", 'skipped_pending_publish'::"text", 'skipped_local_dev'::"text", 'skipped_missing_storage_key'::"text"])))) NOT VALID;



ALTER TABLE "public"."clips"
    ADD CONSTRAINT "clips_asset_storage_provider_check" CHECK ((("asset_storage_provider" IS NULL) OR ("asset_storage_provider" = ANY (ARRAY['r2'::"text", 'local_dev'::"text"])))) NOT VALID;



ALTER TABLE ONLY "public"."clips"
    ADD CONSTRAINT "clips_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."clips"
    ADD CONSTRAINT "clips_publish_status_check" CHECK ((("publish_status" IS NULL) OR ("publish_status" = ANY (ARRAY['draft'::"text", 'ready_for_review'::"text", 'approved'::"text", 'queued'::"text", 'scheduled'::"text", 'published'::"text", 'failed'::"text", 'ready_for_automation'::"text", 'sent_to_n8n'::"text", 'automation_queued'::"text", 'automation_failed'::"text", 'not_ready'::"text", 'needs_clip_render'::"text", 'render_failed'::"text", 'ready_for_manual_publish'::"text", 'manually_published'::"text", 'metricool_ready_manual_export'::"text", 'metricool_scheduled'::"text", 'metricool_published'::"text", 'metricool_failed'::"text"])))) NOT VALID;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingested_videos"
    ADD CONSTRAINT "ingested_videos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingested_videos"
    ADD CONSTRAINT "ingested_videos_platform_external_video_id_key" UNIQUE ("platform", "external_video_id");



ALTER TABLE ONLY "public"."learning_weights"
    ADD CONSTRAINT "learning_weights_pkey" PRIMARY KEY ("reply_type");



ALTER TABLE "public"."mac_mini_clip_packages"
    ADD CONSTRAINT "mac_mini_clip_packages_asset_delete_status_check" CHECK ((("asset_delete_status" IS NULL) OR ("asset_delete_status" = ANY (ARRAY['pending'::"text", 'deleted'::"text", 'failed'::"text", 'skipped_pending_publish'::"text", 'skipped_local_dev'::"text", 'skipped_missing_storage_key'::"text"])))) NOT VALID;



ALTER TABLE "public"."mac_mini_clip_packages"
    ADD CONSTRAINT "mac_mini_clip_packages_asset_storage_provider_check" CHECK ((("asset_storage_provider" IS NULL) OR ("asset_storage_provider" = ANY (ARRAY['r2'::"text", 'local_dev'::"text"])))) NOT VALID;



ALTER TABLE ONLY "public"."mac_mini_clip_packages"
    ADD CONSTRAINT "mac_mini_clip_packages_clip_candidate_id_key" UNIQUE ("clip_candidate_id");



ALTER TABLE ONLY "public"."mac_mini_clip_packages"
    ADD CONSTRAINT "mac_mini_clip_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metricool_handoffs"
    ADD CONSTRAINT "metricool_handoffs_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."metricool_handoffs"
    ADD CONSTRAINT "metricool_handoffs_publish_status_check" CHECK ((("publish_status" IS NULL) OR ("publish_status" = ANY (ARRAY['draft'::"text", 'ready_for_review'::"text", 'approved'::"text", 'queued'::"text", 'scheduled'::"text", 'published'::"text", 'failed'::"text", 'ready_for_automation'::"text", 'sent_to_n8n'::"text", 'automation_queued'::"text", 'automation_failed'::"text", 'not_ready'::"text", 'needs_clip_render'::"text", 'render_failed'::"text", 'ready_for_manual_publish'::"text", 'manually_published'::"text", 'metricool_ready_manual_export'::"text", 'metricool_scheduled'::"text", 'metricool_published'::"text", 'metricool_failed'::"text"])))) NOT VALID;



ALTER TABLE "public"."metricool_handoffs"
    ADD CONSTRAINT "metricool_handoffs_status_check" CHECK ((("status" IS NULL) OR ("status" = ANY (ARRAY['skipped'::"text", 'accepted'::"text", 'failed'::"text"])))) NOT VALID;



ALTER TABLE ONLY "public"."moderation_actions"
    ADD CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."n8n_handoffs"
    ADD CONSTRAINT "n8n_handoffs_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."n8n_handoffs"
    ADD CONSTRAINT "n8n_handoffs_status_check" CHECK ((("status" IS NULL) OR ("status" = ANY (ARRAY['sent_to_n8n'::"text", 'n8n_not_configured'::"text", 'n8n_test_mode'::"text", 'n8n_failed'::"text"])))) NOT VALID;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_log"
    ADD CONSTRAINT "post_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_clip_id_platform_key" UNIQUE ("clip_id", "platform");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."publish_log"
    ADD CONSTRAINT "publish_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."publish_log"
    ADD CONSTRAINT "publish_log_post_id_key" UNIQUE ("post_id");



ALTER TABLE ONLY "public"."publish_logs"
    ADD CONSTRAINT "publish_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."queue_jobs"
    ADD CONSTRAINT "queue_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rbhq_analytics_snapshots"
    ADD CONSTRAINT "rbhq_analytics_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rbhq_clip_scores"
    ADD CONSTRAINT "rbhq_clip_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rbhq_clips"
    ADD CONSTRAINT "rbhq_clips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rbhq_operator_actions"
    ADD CONSTRAINT "rbhq_operator_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rbhq_posted_clips"
    ADD CONSTRAINT "rbhq_posted_clips_clip_id_platform_key" UNIQUE ("clip_id", "platform");



ALTER TABLE ONLY "public"."rbhq_posted_clips"
    ADD CONSTRAINT "rbhq_posted_clips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rbhq_posted_clips"
    ADD CONSTRAINT "rbhq_posted_clips_post_id_key" UNIQUE ("post_id");



ALTER TABLE ONLY "public"."rbhq_posts"
    ADD CONSTRAINT "rbhq_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rbhq_source_items"
    ADD CONSTRAINT "rbhq_source_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rbhq_source_items"
    ADD CONSTRAINT "rbhq_source_items_source_url_key" UNIQUE ("source_url");



ALTER TABLE ONLY "public"."rbhq_workflow_events"
    ADD CONSTRAINT "rbhq_workflow_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reply_feedback"
    ADD CONSTRAINT "reply_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reply_sessions"
    ADD CONSTRAINT "reply_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_channel_id_platform_key" UNIQUE ("channel_id", "platform");



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."source_channels"
    ADD CONSTRAINT "source_channels_channel_key_key" UNIQUE ("channel_key");



ALTER TABLE ONLY "public"."source_channels"
    ADD CONSTRAINT "source_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sources"
    ADD CONSTRAINT "sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_channels"
    ADD CONSTRAINT "user_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_channels"
    ADD CONSTRAINT "user_channels_user_id_channel_id_key" UNIQUE ("user_id", "channel_id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."video_transcripts"
    ADD CONSTRAINT "video_transcripts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."war_room_audit_logs"
    ADD CONSTRAINT "war_room_audit_logs_pkey" PRIMARY KEY ("id");



CREATE INDEX "clip_candidates_clip_prep_status_idx" ON "public"."clip_candidates" USING "btree" ("clip_prep_status", "updated_at" DESC);



CREATE INDEX "clip_candidates_created_at_desc_idx" ON "public"."clip_candidates" USING "btree" ("created_at" DESC);



CREATE INDEX "clip_candidates_ingested_video_id_idx" ON "public"."clip_candidates" USING "btree" ("ingested_video_id");



CREATE INDEX "clip_candidates_score_desc_idx" ON "public"."clip_candidates" USING "btree" ("score" DESC);



CREATE INDEX "clip_candidates_status_idx" ON "public"."clip_candidates" USING "btree" ("status");



CREATE INDEX "clip_sources_active_name_idx" ON "public"."clip_sources" USING "btree" ("active", "source_name");



CREATE INDEX "clips_asset_expiry_idx" ON "public"."clips" USING "btree" ("asset_expires_at") WHERE (("asset_expires_at" IS NOT NULL) AND ("asset_deleted_at" IS NULL));



CREATE INDEX "clips_asset_storage_key_idx" ON "public"."clips" USING "btree" ("asset_storage_key") WHERE ("asset_storage_key" IS NOT NULL);



CREATE INDEX "clips_channel_id_idx" ON "public"."clips" USING "btree" ("channel_id");



CREATE INDEX "clips_channel_status_idx" ON "public"."clips" USING "btree" ("channel_id", "status");



CREATE INDEX "clips_created_at_idx" ON "public"."clips" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "clips_external_id_unique_idx" ON "public"."clips" USING "btree" ("external_id") WHERE ("external_id" IS NOT NULL);



CREATE INDEX "clips_gemini_processed_at_idx" ON "public"."clips" USING "btree" ("gemini_processed_at" DESC) WHERE ("gemini_processed_at" IS NOT NULL);



CREATE INDEX "clips_import_batch_id_idx" ON "public"."clips" USING "btree" ("import_batch_id") WHERE ("import_batch_id" IS NOT NULL);



CREATE INDEX "clips_ingestion_status_idx" ON "public"."clips" USING "btree" ("ingestion_status", "ingested_at" DESC);



CREATE INDEX "clips_last_analytics_at_idx" ON "public"."clips" USING "btree" ("last_analytics_at" DESC) WHERE ("last_analytics_at" IS NOT NULL);



CREATE INDEX "clips_manually_published_at_idx" ON "public"."clips" USING "btree" ("manually_published_at" DESC) WHERE ("publish_status" = 'manually_published'::"text");



CREATE INDEX "clips_ready_for_manual_publish_idx" ON "public"."clips" USING "btree" ("approved_at" DESC) WHERE (("status" = 'approved'::"text") AND ("publish_status" = 'ready_for_manual_publish'::"text"));



CREATE INDEX "clips_source_id_status_idx" ON "public"."clips" USING "btree" ("source_id", "status", "created_at" DESC);



CREATE INDEX "clips_source_name_idx" ON "public"."clips" USING "btree" ("source_name");



CREATE INDEX "clips_status_idx" ON "public"."clips" USING "btree" ("status");



CREATE INDEX "clips_status_score_created_idx" ON "public"."clips" USING "btree" ("status", "ai_score" DESC, "created_at" DESC);



CREATE UNIQUE INDEX "clips_video_url_unique_idx" ON "public"."clips" USING "btree" ("video_url");



CREATE INDEX "clips_virality_score_idx" ON "public"."clips" USING "btree" ("virality_score" DESC) WHERE ("virality_score" IS NOT NULL);



CREATE INDEX "idx_moderation_actions_channel" ON "public"."moderation_actions" USING "btree" ("channel");



CREATE INDEX "idx_moderation_actions_created" ON "public"."moderation_actions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_moderation_actions_post_id" ON "public"."moderation_actions" USING "btree" ("post_id");



CREATE INDEX "idx_notifications_channel" ON "public"."notifications" USING "btree" ("channel");



CREATE INDEX "idx_notifications_created" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("channel", "read");



CREATE INDEX "idx_publish_log_channel" ON "public"."publish_log" USING "btree" ("channel");



CREATE INDEX "idx_publish_log_published" ON "public"."publish_log" USING "btree" ("published_at" DESC);



CREATE INDEX "ingested_videos_platform_external_video_id_idx" ON "public"."ingested_videos" USING "btree" ("platform", "external_video_id");



CREATE INDEX "ingested_videos_published_at_desc_idx" ON "public"."ingested_videos" USING "btree" ("published_at" DESC);



CREATE INDEX "ingested_videos_source_channel_id_idx" ON "public"."ingested_videos" USING "btree" ("source_channel_id");



CREATE INDEX "mac_mini_clip_packages_asset_expiry_idx" ON "public"."mac_mini_clip_packages" USING "btree" ("asset_expires_at") WHERE (("asset_expires_at" IS NOT NULL) AND ("asset_deleted_at" IS NULL));



CREATE INDEX "mac_mini_clip_packages_asset_status_idx" ON "public"."mac_mini_clip_packages" USING "btree" ("asset_status", "created_at" DESC);



CREATE INDEX "mac_mini_clip_packages_asset_storage_key_idx" ON "public"."mac_mini_clip_packages" USING "btree" ("asset_storage_key") WHERE ("asset_storage_key" IS NOT NULL);



CREATE UNIQUE INDEX "mac_mini_clip_packages_candidate_key" ON "public"."mac_mini_clip_packages" USING "btree" ("clip_candidate_id");



CREATE INDEX "mac_mini_clip_packages_pending_idx" ON "public"."mac_mini_clip_packages" USING "btree" ("package_status", "handoff_status", "created_at" DESC);



CREATE INDEX "mac_mini_clip_packages_target_channel_idx" ON "public"."mac_mini_clip_packages" USING "btree" ("target_channel_id");



CREATE INDEX "mac_mini_clip_packages_tiktok_staging_requested_idx" ON "public"."mac_mini_clip_packages" USING "btree" ("tiktok_staging_status", "tiktok_staging_requested_at") WHERE ("tiktok_staging_status" = 'requested'::"text");



CREATE INDEX "metricool_handoffs_clip_created_idx" ON "public"."metricool_handoffs" USING "btree" ("clip_id", "created_at" DESC);



CREATE INDEX "n8n_handoffs_clip_created_idx" ON "public"."n8n_handoffs" USING "btree" ("clip_id", "created_at" DESC);



CREATE INDEX "posts_channel_id_idx" ON "public"."posts" USING "btree" ("channel_id");



CREATE INDEX "posts_duplicate_hash_idx" ON "public"."posts" USING "btree" ("duplicate_hash") WHERE ("duplicate_hash" IS NOT NULL);



CREATE INDEX "posts_review_status_idx" ON "public"."posts" USING "btree" ("review_status");



CREATE INDEX "posts_status_idx" ON "public"."posts" USING "btree" ("status");



CREATE INDEX "posts_status_scheduled_time_idx" ON "public"."posts" USING "btree" ("status", "scheduled_time");



CREATE INDEX "publish_logs_post_id_idx" ON "public"."publish_logs" USING "btree" ("post_id", "created_at" DESC);



CREATE INDEX "rbhq_analytics_post_collected_idx" ON "public"."rbhq_analytics_snapshots" USING "btree" ("post_id", "collected_at" DESC);



CREATE UNIQUE INDEX "rbhq_clips_source_time_unique_idx" ON "public"."rbhq_clips" USING "btree" ("source_item_id", "start_time", "end_time") WHERE (("start_time" IS NOT NULL) AND ("end_time" IS NOT NULL));



CREATE INDEX "rbhq_clips_state_created_idx" ON "public"."rbhq_clips" USING "btree" ("workflow_state", "created_at" DESC);



CREATE INDEX "rbhq_operator_actions_entity_idx" ON "public"."rbhq_operator_actions" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "rbhq_posted_clips_posted_idx" ON "public"."rbhq_posted_clips" USING "btree" ("posted_at" DESC);



CREATE UNIQUE INDEX "rbhq_posts_clip_platform_unique_idx" ON "public"."rbhq_posts" USING "btree" ("clip_id", "platform");



CREATE INDEX "rbhq_posts_state_created_idx" ON "public"."rbhq_posts" USING "btree" ("workflow_state", "created_at" DESC);



CREATE UNIQUE INDEX "rbhq_source_items_external_idx" ON "public"."rbhq_source_items" USING "btree" ("source_platform", "source_external_id") WHERE ("source_external_id" IS NOT NULL);



CREATE INDEX "rbhq_workflow_events_entity_idx" ON "public"."rbhq_workflow_events" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "social_accounts_channel_platform_idx" ON "public"."social_accounts" USING "btree" ("channel_id", "platform");



CREATE INDEX "source_channels_channel_key_idx" ON "public"."source_channels" USING "btree" ("channel_key");



CREATE INDEX "source_channels_enabled_idx" ON "public"."source_channels" USING "btree" ("enabled");



CREATE UNIQUE INDEX "sources_platform_handle_idx" ON "public"."sources" USING "btree" ("platform", "handle") WHERE ("handle" IS NOT NULL);



CREATE INDEX "video_transcripts_ingested_video_id_idx" ON "public"."video_transcripts" USING "btree" ("ingested_video_id");



CREATE INDEX "war_room_audit_logs_post_timestamp_idx" ON "public"."war_room_audit_logs" USING "btree" ("post_id", "timestamp" DESC);



CREATE INDEX "war_room_audit_logs_stage_timestamp_idx" ON "public"."war_room_audit_logs" USING "btree" ("stage", "timestamp" DESC);



CREATE OR REPLACE TRIGGER "clip_sources_set_updated_at" BEFORE UPDATE ON "public"."clip_sources" FOR EACH ROW EXECUTE FUNCTION "public"."set_clip_sources_updated_at"();



CREATE OR REPLACE TRIGGER "clips_refresh_source_counts" AFTER INSERT OR DELETE OR UPDATE ON "public"."clips" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_clip_source_counts_trigger"();



CREATE OR REPLACE TRIGGER "clips_set_updated_at" BEFORE UPDATE ON "public"."clips" FOR EACH ROW EXECUTE FUNCTION "public"."set_clips_updated_at"();



ALTER TABLE ONLY "public"."channel_programming"
    ADD CONSTRAINT "channel_programming_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_sources"
    ADD CONSTRAINT "channel_sources_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_sources"
    ADD CONSTRAINT "channel_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clip_candidates"
    ADD CONSTRAINT "clip_candidates_ingested_video_id_fkey" FOREIGN KEY ("ingested_video_id") REFERENCES "public"."ingested_videos"("id");



ALTER TABLE ONLY "public"."clips"
    ADD CONSTRAINT "clips_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id");



ALTER TABLE ONLY "public"."clips"
    ADD CONSTRAINT "clips_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."clip_sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingested_videos"
    ADD CONSTRAINT "ingested_videos_source_channel_id_fkey" FOREIGN KEY ("source_channel_id") REFERENCES "public"."source_channels"("id");



ALTER TABLE ONLY "public"."mac_mini_clip_packages"
    ADD CONSTRAINT "mac_mini_clip_packages_clip_candidate_id_fkey" FOREIGN KEY ("clip_candidate_id") REFERENCES "public"."clip_candidates"("id");



ALTER TABLE ONLY "public"."mac_mini_clip_packages"
    ADD CONSTRAINT "mac_mini_clip_packages_ingested_video_id_fkey" FOREIGN KEY ("ingested_video_id") REFERENCES "public"."ingested_videos"("id");



ALTER TABLE ONLY "public"."post_log"
    ADD CONSTRAINT "post_log_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_log"
    ADD CONSTRAINT "post_log_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."queue_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."post_log"
    ADD CONSTRAINT "post_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "public"."queue_jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."publish_logs"
    ADD CONSTRAINT "publish_logs_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."queue_jobs"
    ADD CONSTRAINT "queue_jobs_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."queue_jobs"
    ADD CONSTRAINT "queue_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rbhq_analytics_snapshots"
    ADD CONSTRAINT "rbhq_analytics_snapshots_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."rbhq_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rbhq_clip_scores"
    ADD CONSTRAINT "rbhq_clip_scores_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "public"."rbhq_clips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rbhq_clips"
    ADD CONSTRAINT "rbhq_clips_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "public"."rbhq_source_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rbhq_operator_actions"
    ADD CONSTRAINT "rbhq_operator_actions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rbhq_posted_clips"
    ADD CONSTRAINT "rbhq_posted_clips_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "public"."rbhq_clips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rbhq_posted_clips"
    ADD CONSTRAINT "rbhq_posted_clips_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."rbhq_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rbhq_posts"
    ADD CONSTRAINT "rbhq_posts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rbhq_posts"
    ADD CONSTRAINT "rbhq_posts_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "public"."rbhq_clips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rbhq_workflow_events"
    ADD CONSTRAINT "rbhq_workflow_events_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reply_feedback"
    ADD CONSTRAINT "reply_feedback_reply_session_id_fkey" FOREIGN KEY ("reply_session_id") REFERENCES "public"."reply_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reply_sessions"
    ADD CONSTRAINT "reply_sessions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reply_sessions"
    ADD CONSTRAINT "reply_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sources"
    ADD CONSTRAINT "sources_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sources"
    ADD CONSTRAINT "sources_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_channels"
    ADD CONSTRAINT "user_channels_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_channels"
    ADD CONSTRAINT "user_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_default_channel_id_fkey" FOREIGN KEY ("default_channel_id") REFERENCES "public"."channels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_transcripts"
    ADD CONSTRAINT "video_transcripts_ingested_video_id_fkey" FOREIGN KEY ("ingested_video_id") REFERENCES "public"."ingested_videos"("id");



CREATE POLICY "Users can manage own settings" ON "public"."user_settings" USING (true) WITH CHECK (true);



CREATE POLICY "anon_insert_audit_logs" ON "public"."war_room_audit_logs" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "anon_select_audit_logs" ON "public"."war_room_audit_logs" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_select_channels" ON "public"."channels" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_select_posts" ON "public"."posts" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_select_user_channels" ON "public"."user_channels" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_select_users" ON "public"."users" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_update_posts" ON "public"."posts" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "block_anon_channels" ON "public"."channels" TO "anon" USING (false);



CREATE POLICY "block_anon_clip_sources" ON "public"."clip_sources" TO "anon" USING (false);



CREATE POLICY "block_anon_clips" ON "public"."clips" TO "anon" USING (false);



CREATE POLICY "block_anon_comments" ON "public"."comments" TO "anon" USING (false);



CREATE POLICY "block_anon_post_log" ON "public"."post_log" TO "anon" USING (false);



CREATE POLICY "block_anon_posts" ON "public"."posts" TO "anon" USING (false);



CREATE POLICY "block_anon_publish_logs" ON "public"."publish_logs" TO "anon" USING (false);



CREATE POLICY "block_anon_queue_jobs" ON "public"."queue_jobs" TO "anon" USING (false);



CREATE POLICY "block_anon_rbhq_analytics_snapshots" ON "public"."rbhq_analytics_snapshots" TO "anon" USING (false);



CREATE POLICY "block_anon_rbhq_clip_scores" ON "public"."rbhq_clip_scores" TO "anon" USING (false);



CREATE POLICY "block_anon_rbhq_clips" ON "public"."rbhq_clips" TO "anon" USING (false);



CREATE POLICY "block_anon_rbhq_operator_actions" ON "public"."rbhq_operator_actions" TO "anon" USING (false);



CREATE POLICY "block_anon_rbhq_posted_clips" ON "public"."rbhq_posted_clips" TO "anon" USING (false);



CREATE POLICY "block_anon_rbhq_posts" ON "public"."rbhq_posts" TO "anon" USING (false);



CREATE POLICY "block_anon_rbhq_source_items" ON "public"."rbhq_source_items" TO "anon" USING (false);



CREATE POLICY "block_anon_rbhq_workflow_events" ON "public"."rbhq_workflow_events" TO "anon" USING (false);



CREATE POLICY "block_anon_social_accounts" ON "public"."social_accounts" TO "anon" USING (false);



CREATE POLICY "block_anon_sources" ON "public"."sources" TO "anon" USING (false);



CREATE POLICY "block_anon_user_channels" ON "public"."user_channels" TO "anon" USING (false);



CREATE POLICY "block_anon_users" ON "public"."users" TO "anon" USING (false);



CREATE POLICY "block_anon_war_room_audit_logs" ON "public"."war_room_audit_logs" TO "anon" USING (false);



ALTER TABLE "public"."channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clip_candidates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clip_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingested_videos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_weights" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "learning_weights_all" ON "public"."learning_weights" USING (true) WITH CHECK (true);



ALTER TABLE "public"."mac_mini_clip_packages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."metricool_handoffs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."moderation_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."publish_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."publish_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."queue_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rbhq_analytics_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rbhq_clip_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rbhq_clips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rbhq_operator_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rbhq_posted_clips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rbhq_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rbhq_source_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rbhq_workflow_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reply_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reply_feedback_all" ON "public"."reply_feedback" USING (true) WITH CHECK (true);



ALTER TABLE "public"."reply_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reply_sessions_all" ON "public"."reply_sessions" USING (true) WITH CHECK (true);



ALTER TABLE "public"."social_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."source_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_transcripts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."war_room_audit_logs" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_clip_source_counts"("target_source_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_clip_source_counts"("target_source_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_clip_source_counts"("target_source_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_clip_source_counts_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_clip_source_counts_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_clip_source_counts_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_clip_sources_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_clip_sources_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_clip_sources_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_clips_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_clips_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_clips_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."channel_programming" TO "anon";
GRANT ALL ON TABLE "public"."channel_programming" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_programming" TO "service_role";



GRANT ALL ON TABLE "public"."channel_sources" TO "anon";
GRANT ALL ON TABLE "public"."channel_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_sources" TO "service_role";



GRANT ALL ON TABLE "public"."channels" TO "anon";
GRANT ALL ON TABLE "public"."channels" TO "authenticated";
GRANT ALL ON TABLE "public"."channels" TO "service_role";



GRANT ALL ON TABLE "public"."clip_candidates" TO "anon";
GRANT ALL ON TABLE "public"."clip_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."clip_candidates" TO "service_role";



GRANT ALL ON TABLE "public"."clip_sources" TO "anon";
GRANT ALL ON TABLE "public"."clip_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."clip_sources" TO "service_role";



GRANT ALL ON TABLE "public"."clips" TO "anon";
GRANT ALL ON TABLE "public"."clips" TO "authenticated";
GRANT ALL ON TABLE "public"."clips" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."ingested_videos" TO "anon";
GRANT ALL ON TABLE "public"."ingested_videos" TO "authenticated";
GRANT ALL ON TABLE "public"."ingested_videos" TO "service_role";



GRANT ALL ON TABLE "public"."learning_weights" TO "anon";
GRANT ALL ON TABLE "public"."learning_weights" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_weights" TO "service_role";



GRANT ALL ON TABLE "public"."mac_mini_clip_packages" TO "anon";
GRANT ALL ON TABLE "public"."mac_mini_clip_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."mac_mini_clip_packages" TO "service_role";



GRANT ALL ON TABLE "public"."metricool_handoffs" TO "anon";
GRANT ALL ON TABLE "public"."metricool_handoffs" TO "authenticated";
GRANT ALL ON TABLE "public"."metricool_handoffs" TO "service_role";



GRANT ALL ON TABLE "public"."moderation_actions" TO "anon";
GRANT ALL ON TABLE "public"."moderation_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."moderation_actions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."moderation_actions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."moderation_actions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."moderation_actions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."n8n_handoffs" TO "anon";
GRANT ALL ON TABLE "public"."n8n_handoffs" TO "authenticated";
GRANT ALL ON TABLE "public"."n8n_handoffs" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."post_log" TO "anon";
GRANT ALL ON TABLE "public"."post_log" TO "authenticated";
GRANT ALL ON TABLE "public"."post_log" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON TABLE "public"."publish_log" TO "anon";
GRANT ALL ON TABLE "public"."publish_log" TO "authenticated";
GRANT ALL ON TABLE "public"."publish_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."publish_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."publish_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."publish_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."publish_logs" TO "anon";
GRANT ALL ON TABLE "public"."publish_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."publish_logs" TO "service_role";



GRANT ALL ON TABLE "public"."queue_jobs" TO "anon";
GRANT ALL ON TABLE "public"."queue_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."queue_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."rbhq_analytics_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."rbhq_analytics_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."rbhq_analytics_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."rbhq_clip_scores" TO "anon";
GRANT ALL ON TABLE "public"."rbhq_clip_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."rbhq_clip_scores" TO "service_role";



GRANT ALL ON TABLE "public"."rbhq_clips" TO "anon";
GRANT ALL ON TABLE "public"."rbhq_clips" TO "authenticated";
GRANT ALL ON TABLE "public"."rbhq_clips" TO "service_role";



GRANT ALL ON TABLE "public"."rbhq_operator_actions" TO "anon";
GRANT ALL ON TABLE "public"."rbhq_operator_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."rbhq_operator_actions" TO "service_role";



GRANT ALL ON TABLE "public"."rbhq_posted_clips" TO "anon";
GRANT ALL ON TABLE "public"."rbhq_posted_clips" TO "authenticated";
GRANT ALL ON TABLE "public"."rbhq_posted_clips" TO "service_role";



GRANT ALL ON TABLE "public"."rbhq_posts" TO "anon";
GRANT ALL ON TABLE "public"."rbhq_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."rbhq_posts" TO "service_role";



GRANT ALL ON TABLE "public"."rbhq_source_items" TO "anon";
GRANT ALL ON TABLE "public"."rbhq_source_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rbhq_source_items" TO "service_role";



GRANT ALL ON TABLE "public"."rbhq_workflow_events" TO "anon";
GRANT ALL ON TABLE "public"."rbhq_workflow_events" TO "authenticated";
GRANT ALL ON TABLE "public"."rbhq_workflow_events" TO "service_role";



GRANT ALL ON TABLE "public"."reply_feedback" TO "anon";
GRANT ALL ON TABLE "public"."reply_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."reply_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."reply_sessions" TO "anon";
GRANT ALL ON TABLE "public"."reply_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."reply_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."social_accounts" TO "anon";
GRANT ALL ON TABLE "public"."social_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."social_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."source_channels" TO "anon";
GRANT ALL ON TABLE "public"."source_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."source_channels" TO "service_role";



GRANT ALL ON TABLE "public"."sources" TO "anon";
GRANT ALL ON TABLE "public"."sources" TO "authenticated";
GRANT ALL ON TABLE "public"."sources" TO "service_role";



GRANT ALL ON TABLE "public"."user_channels" TO "anon";
GRANT ALL ON TABLE "public"."user_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."user_channels" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."video_transcripts" TO "anon";
GRANT ALL ON TABLE "public"."video_transcripts" TO "authenticated";
GRANT ALL ON TABLE "public"."video_transcripts" TO "service_role";



GRANT ALL ON TABLE "public"."war_room_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."war_room_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."war_room_audit_logs" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
