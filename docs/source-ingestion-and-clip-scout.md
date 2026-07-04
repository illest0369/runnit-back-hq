# Source Ingestion and Clip Candidate Scout

This phase adds the foundation for RBHQ source intake and Opus-style candidate scouting. It does not add live social posting, platform credentials, n8n Cloud, Metricool dependency, or full FFmpeg clipping.

Manual approval remains required before any n8n handoff.

## Existing Inventory

RBHQ already has several related paths:

- `app/api/ingest/youtube/route.ts`: legacy/admin YouTube API ingest that requires `YOUTUBE_API_KEY` and writes `queue_jobs` plus `posts`.
- `app/api/cron/ingest/route.ts`: cron-style YouTube RSS ingest for existing `sources`, also bridging into `queue_jobs`, `posts`, and pending `clips`.
- `lib/rbhq-native-ingest.ts`: richer native ingest path that can use RSS, `yt-dlp`, Gemini scoring, and the existing moderation import.
- `lib/clip-bridge.ts`: safe bridge from sourced content into pending `clips`; this is the best reuse point for future candidate promotion because pending clips still require human review.
- `lib/moderation-queue.ts`: current clips review/approval model. Pending clips become approved only through human/admin decisions, then render/export states determine Metricool/manual/n8n handoff readiness.
- `app/api/internal/import-clips/route.ts`: secret-protected import endpoint for clips.
- `app/api/metricool-export/*` and `app/api/n8n-export/*`: export/handoff surfaces for approved, media-ready clips only.

Missing before this phase:

- A keyless YouTube RSS ingestion script that does not depend on the YouTube Data API.
- Durable source intake tables separate from legacy queue/post tables.
- A first `clip_candidates` table for scouting before review.
- A conservative scout command that does not invent exact timestamps when transcripts are missing.

## Database Foundation

Migration:

```text
supabase/migrations/202607040003_source_ingestion_clip_candidates.sql
```

Adds:

- `source_channels`
- `ingested_videos`
- `video_transcripts`
- `clip_candidates`

The migration is additive and non-destructive. It does not change publish states and does not mark anything as posted.

## YouTube RSS Ingestion

Module:

```text
lib/youtube-rss.ts
```

Script:

```bash
npm run ingest:youtube-rss -- --url <rss_url> --channel <channel_key>
```

Env fallback:

```bash
YOUTUBE_RSS_URL=https://www.youtube.com/feeds/videos.xml?channel_id=UC...
YOUTUBE_SOURCE_CHANNEL_KEY=espn
YOUTUBE_SOURCE_DISPLAY_NAME=ESPN
YOUTUBE_TARGET_RBHQ_CHANNEL_ID=a1000000-0000-0000-0000-000000000001
```

YouTube RSS V1 requires no YouTube API key. The script creates or reuses a `source_channels` row, inserts new `ingested_videos`, and safely skips duplicates by `platform + external_video_id`.

## Clip Candidate Scout

Script:

```bash
npm run scout:video -- --video-id <ingested_video_id>
```

The scout reads `ingested_videos` and the newest `video_transcripts` row, if present.

If a timed transcript exists, the scout may set `start_seconds` and `end_seconds` from transcript segment timing. If no timed transcript exists, those fields remain `null`. RBHQ must not fake exact clip timestamps from RSS/title/description alone.

Without transcripts, the candidate is intentionally conservative:

- `status = candidate`
- low score
- `score_breakdown.limitations` explains that the candidate is title/description based
- no live posting or export state is set

## Scoring Fields

`clip_candidates.score` is a rough scout score, not approval. `score_breakdown` should explain signals and limitations, including whether a transcript or timed transcript was available.

Real Opus-style moment detection needs transcript timing, content understanding, and later clipping/rendering work.

## Promotion To Review

Do not send `clip_candidates` directly to n8n.

The safest next promotion path is:

1. Select a `clip_candidates` row.
2. Require admin/test-only action.
3. Convert it through `lib/clip-bridge.ts` or `lib/moderation-queue.ts` into a pending `clips` row.
4. Keep `status = pending` so the existing review UI/manual approval flow is required.
5. Only after approval and media readiness can the clip appear in export/n8n handoff surfaces.

Suggested next files for a promotion adapter:

- `lib/clip-bridge.ts`
- `lib/moderation-queue.ts`
- `app/api/internal/import-clips/route.ts`
- a new admin-only route such as `app/api/clip-candidates/[candidateId]/promote/route.ts`

This phase leaves promotion documented rather than forced because candidate rows may not have real media assets or exact timestamps yet.

## Smoke Test

Fixture:

```text
docs/fixtures/youtube-rss.sample.xml
```

Run:

```bash
npm run smoke:source-ingestion
```

The smoke verifies:

- sample RSS parsing
- duplicate feed entries are deduped
- source channel create/reuse behavior
- ingested video creation behavior
- safe clip candidate creation
- no n8n requirement
- no live publish state

When the Supabase source tables have not been migrated yet, the smoke reports memory mode and a migration note. Once migration `202607040003_source_ingestion_clip_candidates.sql` is applied, the same smoke uses real Supabase rows and cleans them up.

## n8n Relationship

n8n remains downstream only. It receives approved/export-ready posts after human approval. `automation_queued` from n8n means payload receipt only; it is not proof of TikTok, Instagram, YouTube, or any other platform posting.
