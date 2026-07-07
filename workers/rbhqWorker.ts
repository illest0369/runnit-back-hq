import { Worker } from 'bullmq'

import { getApifyDatasetItems, getApifyRun, runApifyActor } from '../lib/apify/client'
import {
  normalizeApifyDatasetItems,
  normalizeApifyItem,
  type NormalizedSourceItem,
} from '../lib/apify/normalize'
import {
  createWorkerConnection,
  enqueueRbhqApifyPollJob,
  RBHQ_ANALYTICS_QUEUE_NAME,
  RBHQ_APIFY_POLL_QUEUE_NAME,
  RBHQ_INGEST_QUEUE_NAME,
  RBHQ_POST_QUEUE_NAME,
  RBHQ_SCORE_QUEUE_NAME,
  type RbhqAnalyticsJobData,
  type RbhqApifyPollJobData,
  type RbhqIngestJobData,
  type RbhqPostJobData,
  type RbhqScoreJobData,
} from '../lib/queue'
import { recordTikTokAnalyticsSnapshot } from '../lib/analytics/tiktok'
import { scoreClipsWithGemini, scoreClipWithGemini } from '../lib/gemini/scoring'
import { getClipById, importClips } from '../lib/moderation-queue'
import { getStoredTikTokAnalysis, hasTikTokPostingReadiness } from '../lib/tiktok-analyzer'
import { markSourcesIngestStarted, updateSourcesIngestHealth } from '../lib/rbhq-source-ingest'
import { runNativeRbhqIngest } from '../lib/rbhq-native-ingest'
import { supabaseAdminClient } from '../lib/supabase-admin'
import { transitionRbhqState } from '../lib/workflow/transition'

const TERMINAL_APIFY_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'])
const MAC_MINI_READY_PUBLISH_STATUSES = new Set([
  'metricool_ready_manual_export',
  'ready_for_manual_publish',
])

async function upsertSourceItems(items: NormalizedSourceItem[]) {
  if (items.length === 0) {
    return 0
  }

  const { error } = await supabaseAdminClient
    .from('rbhq_source_items')
    .upsert(
      items.map((item) => ({
        ...item,
        duration_seconds: item.duration_seconds ?? null,
        views: item.views ?? 0,
        likes: item.likes ?? 0,
        comments: item.comments ?? 0,
        upload_date: item.upload_date ?? null,
      })),
      { onConflict: 'source_url' },
    )

  if (error) {
    throw new Error(error.message)
  }

  return items.length
}

async function resolveSingleChannelIdForSources(sourceIds: string[]) {
  const ids = [...new Set(sourceIds.filter(Boolean))]
  if (ids.length === 0) return null

  const { data, error } = await supabaseAdminClient
    .from('sources')
    .select('channel_id')
    .in('id', ids)

  if (error) {
    throw new Error(error.message)
  }

  const channelIds = [...new Set((data ?? []).map((row: { channel_id: string | null }) => row.channel_id).filter(Boolean))]
  return channelIds.length === 1 ? channelIds[0] : null
}

export function createRbhqWorkers() {
  const ingestWorker = new Worker<RbhqIngestJobData, string, 'run-apify-actor'>(
    RBHQ_INGEST_QUEUE_NAME,
    async (job) => {
      if (job.data.mode === 'native') {
        const result = await runNativeRbhqIngest({
          sourceIds: job.data.sourceIds,
          limit: typeof job.data.input.limit === 'number' ? job.data.input.limit : undefined,
        })
        return `native:sources:${result.sources}:discovered:${result.discovered}:stored:${result.stored}:scored:${result.scored}:inserted:${result.imported}:skipped:${result.skipped}:failed:${result.failed}`
      }

      const sourceIds = job.data.sourceIds ?? []
      await markSourcesIngestStarted(sourceIds)
      if (!job.data.actorId) {
        throw new Error('MISSING_APIFY_ACTOR_ID')
      }
      const run = await runApifyActor(job.data.actorId, job.data.input)
      await enqueueRbhqApifyPollJob({
        platform: job.data.platform,
        runId: run.id,
        mode: job.data.mode,
        sourceIds,
        sourceCount: job.data.sourceCount,
      })
      return run.id
    },
    { connection: createWorkerConnection(), concurrency: 1 },
  )

  const pollWorker = new Worker<RbhqApifyPollJobData, string, 'poll-apify-run'>(
    RBHQ_APIFY_POLL_QUEUE_NAME,
    async (job) => {
      const run = await getApifyRun(job.data.runId)
      if (!TERMINAL_APIFY_STATUSES.has(run.status)) {
        await enqueueRbhqApifyPollJob(job.data, 30_000)
        return run.status
      }

      if (run.status !== 'SUCCEEDED' || !run.defaultDatasetId) {
        await updateSourcesIngestHealth({
          sourceIds: job.data.sourceIds ?? [],
          fetched: 0,
          imported: 0,
          success: false,
        })
        throw new Error(`APIFY_RUN_${run.status}`)
      }

      const rawItems = await getApifyDatasetItems<Record<string, unknown>>(run.defaultDatasetId)
      const items = rawItems
        .map((item) => normalizeApifyItem(job.data.platform, item))
        .filter((item): item is NormalizedSourceItem => Boolean(item))

      const storedCount = await upsertSourceItems(items)
      const importBatchId = `apify:${job.data.runId}:${new Date().toISOString()}`
      const channelId = await resolveSingleChannelIdForSources(job.data.sourceIds ?? [])
      const normalized = normalizeApifyDatasetItems(rawItems, {
        importBatchId,
        defaultSourceName: `Apify ${job.data.platform}`,
        defaultSourceType: job.data.platform,
      })
      const scored = await scoreClipsWithGemini(normalized.clips)
      const imported = scored.scored.length > 0
        ? await importClips({ clips: scored.scored, channelId, importBatchId })
        : {
            inserted_count: 0,
            skipped_count: 0,
            failed_count: 0,
          }
      await updateSourcesIngestHealth({
        sourceIds: job.data.sourceIds ?? [],
        fetched: rawItems.length,
        imported: imported.inserted_count,
        success: true,
      })

      return `stored:${storedCount}:inserted:${imported.inserted_count}:skipped:${imported.skipped_count}:failed:${normalized.failed.length + scored.failed.length + imported.failed_count}`
    },
    { connection: createWorkerConnection(), concurrency: 1 },
  )

  const scoreWorker = new Worker<RbhqScoreJobData, string, 'score-clip'>(
    RBHQ_SCORE_QUEUE_NAME,
    async (job) => {
      const { data: clip, error } = await supabaseAdminClient
        .from('rbhq_clips')
        .select('id, workflow_state, source_item_id, rbhq_source_items(title, creator, source_platform, raw_payload)')
        .eq('id', job.data.clipId)
        .single()

      if (error || !clip) {
        throw new Error(error?.message || 'CLIP_NOT_FOUND')
      }

      const source = Array.isArray(clip.rbhq_source_items)
        ? clip.rbhq_source_items[0]
        : clip.rbhq_source_items

      await transitionRbhqState({
        entityType: 'clip',
        entityId: clip.id,
        fromState: clip.workflow_state,
        toState: 'SCORING',
        actor: { type: 'worker' },
        reason: 'GEMINI_SCORING_STARTED',
      })

      const score = await scoreClipWithGemini({
        title: source?.title ?? 'Untitled sports clip',
        creator: source?.creator ?? null,
        sourcePlatform: source?.source_platform ?? 'unknown',
        metadata: source?.raw_payload ?? {},
      })

      const { error: insertError } = await supabaseAdminClient.from('rbhq_clip_scores').insert({
        clip_id: clip.id,
        virality_score: score.virality_score,
        hook_strength: score.hook_strength,
        controversy_score: score.controversy_score,
        sports_category: score.sports_category,
        emotion: score.emotion,
        recommended_hook: score.recommended_hook,
        risk_flags: score.risk_flags,
        raw_response: score,
      })

      if (insertError) {
        throw new Error(insertError.message)
      }

      await transitionRbhqState({
        entityType: 'clip',
        entityId: clip.id,
        fromState: 'SCORING',
        toState: 'READY_FOR_CLIP_APPROVAL',
        actor: { type: 'worker' },
        reason: 'GEMINI_SCORING_COMPLETE',
      })

      return `scored:${clip.id}`
    },
    { connection: createWorkerConnection(), concurrency: 1 },
  )

  const postWorker = new Worker<RbhqPostJobData, string, 'post-to-tiktok'>(
    RBHQ_POST_QUEUE_NAME,
    async (job) => {
      const clip = await getClipById(job.data.postId, { includeMetricoolHandoffStatus: false })

      if (!clip) {
        throw new Error('CLIP_NOT_FOUND')
      }

      if (clip.status !== 'approved') {
        throw new Error(`CLIP_NOT_APPROVED:${clip.status}`)
      }

      if (!clip.video_url?.trim()) {
        throw new Error('CLIP_MISSING_RENDERED_VIDEO')
      }

      if (!MAC_MINI_READY_PUBLISH_STATUSES.has(clip.publish_status)) {
        throw new Error(`CLIP_NOT_READY_FOR_MAC_MINI_POST:${clip.publish_status}`)
      }

      const analysis = getStoredTikTokAnalysis(clip.moderation_notes)
      if (!analysis?.captionDraft || analysis.hashtagPack.length === 0) {
        throw new Error('CLIP_MISSING_TIKTOK_CAPTION_DRAFT')
      }

      if (!hasTikTokPostingReadiness(clip)) {
        throw new Error('CLIP_NOT_VERTICAL_READY_FOR_TIKTOK')
      }

      console.log('[rbhq-post] dry-run received approved clip', {
        postId: clip.id,
        channelId: clip.channel_id,
        publishStatus: clip.publish_status,
      })

      return `dry-run:post:${clip.id}`
    },
    { connection: createWorkerConnection(), concurrency: 1 },
  )

  const analyticsWorker = new Worker<RbhqAnalyticsJobData, string, 'poll-tiktok-analytics'>(
    RBHQ_ANALYTICS_QUEUE_NAME,
    async (job) => {
      await recordTikTokAnalyticsSnapshot({
        postId: job.data.postId,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        rawPayload: { status: 'stub_until_tiktok_metrics_connected' },
      })
      return `analytics:${job.data.postId}`
    },
    { connection: createWorkerConnection(), concurrency: 1 },
  )

  return [ingestWorker, pollWorker, scoreWorker, postWorker, analyticsWorker]
}
