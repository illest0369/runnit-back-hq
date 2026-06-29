// LEGACY — not used in active ingest pipeline
import { writeAuditLog } from '../lib/audit-log'
import { supabaseAdminClient } from '../lib/supabase-admin'
import { runCommand } from './processService'

type SourceCategory = 'sports' | 'combat' | 'women'
type SourcePriority = 'high' | 'medium'

type SourceRow = {
  id: string
  channel_id: string
  platform: string
  category: SourceCategory | null
  channel_name: string | null
  channel_url: string | null
  url: string | null
  priority: SourcePriority | null
  priority_weight: number | string | null
  avg_clip_score?: number | string | null
  total_clips_generated?: number | null
  active: boolean | null
}

type PlaylistVideo = {
  videoId: string
  title: string
  durationSeconds: number
  videoUrl: string
  keywordScore: number
  source: SourceRow
  priorityScore: number
}

type IngestionSummary = {
  total_sources: number
  videos_fetched: number
  videos_rejected: number
  videos_enqueued: number
  jobs: Array<{
    sourceId: string
    sourceName: string
    videoId: string
    videoUrl: string
    channelId: string
    jobId: string | null
  }>
}

const TITLE_KEYWORDS = ['vs', 'call', 'reaction', 'argument', 'fight', 'heated', 'disrespect']
const MAX_VIDEOS_PER_SOURCE = 10
const MAX_ENQUEUED_PER_RUN = 20
const SOURCE_WEIGHT_MIN = 0.5
const SOURCE_WEIGHT_MAX = 3

type SourceRunStats = {
  fetched: number
  enqueued: number
}

function clampSourceWeight(value: number) {
  return Math.min(SOURCE_WEIGHT_MAX, Math.max(SOURCE_WEIGHT_MIN, value))
}

function normalizeCategory(category: string | null | undefined): SourceCategory | null {
  if (category === 'sports' || category === 'combat' || category === 'women') {
    return category
  }

  if (category === 'womens_sports') {
    return 'women'
  }

  return null
}

function countKeywordMatches(title: string) {
  const normalizedTitle = title.toLowerCase()
  return TITLE_KEYWORDS.reduce(
    (total, keyword) => total + (normalizedTitle.includes(keyword) ? 1 : 0),
    0,
  )
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function buildWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`
}

function shouldRejectVideo(input: {
  durationSeconds: number
  keywordScore: number
  sourcePriority: SourcePriority | null
}) {
  return (
    input.durationSeconds < 10 ||
    input.durationSeconds > 60 * 60 ||
    (input.keywordScore === 0 && input.sourcePriority !== 'high')
  )
}

async function listActiveSources() {
  const { data, error } = await supabaseAdminClient
    .from('sources')
    .select(
      'id, channel_id, platform, category, channel_name, channel_url, url, priority, priority_weight, avg_clip_score, total_clips_generated, active',
    )
    .eq('platform', 'youtube')
    .eq('active', true)
    .order('priority_weight', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as SourceRow[]
}

async function listProcessedVideoIds() {
  const { data, error } = await supabaseAdminClient
    .from('processed_videos')
    .select('video_id')

  if (error) {
    throw new Error(error.message)
  }

  return new Set(
    (data ?? [])
      .map((row: { video_id: string | null }) => row.video_id?.trim())
      .filter((videoId): videoId is string => Boolean(videoId)),
  )
}

async function rebalanceSourcePriorityWeights(sources: SourceRow[]) {
  if (sources.length === 0) {
    return
  }

  const sourceIds = sources.map((source) => source.id)
  const { data: processedVideos, error: processedError } = await supabaseAdminClient
    .from('processed_videos')
    .select('source_id, video_url')
    .in('source_id', sourceIds)

  if (processedError) {
    throw new Error(processedError.message)
  }

  const sourceUrls = [
    ...new Set(
      (processedVideos ?? []).map(
        (video: { source_id: string; video_url: string }) => video.video_url,
      ),
    ),
  ]
  if (sourceUrls.length === 0) {
    return
  }

  const { data: queueJobs, error: queueError } = await supabaseAdminClient
    .from('queue_jobs')
    .select('source_url, score')
    .in('source_url', sourceUrls)

  if (queueError) {
    throw new Error(queueError.message)
  }

  const scoreBuckets = new Map<string, number[]>()
  for (const row of queueJobs ?? []) {
    const current = scoreBuckets.get(row.source_url) ?? []
    current.push(toNumber(row.score))
    scoreBuckets.set(row.source_url, current)
  }

  const bySourceId = new Map<string, number[]>()
  for (const video of processedVideos ?? []) {
    const scores = scoreBuckets.get(video.video_url)
    if (!scores || scores.length === 0) {
      continue
    }

    const current = bySourceId.get(video.source_id) ?? []
    bySourceId.set(video.source_id, current.concat(scores))
  }

  const updates = sources
    .map((source) => {
      const scores = bySourceId.get(source.id) ?? []
      const averageScore = scores.reduce((total, score) => total + score, 0) / scores.length
      let nextWeight = clampSourceWeight(toNumber(source.priority_weight) || 1)

      if (scores.length >= 3 && averageScore < 60) {
        nextWeight = clampSourceWeight(nextWeight - 0.05)
      } else {
        nextWeight = clampSourceWeight(nextWeight)
      }

      return {
        id: source.id,
        avg_clip_score: Number.isFinite(averageScore) ? Number(averageScore.toFixed(2)) : 0,
        total_clips_generated: scores.length,
        priority_weight: nextWeight,
      }
    })
    .filter(Boolean) as Array<{
      id: string
      avg_clip_score: number
      total_clips_generated: number
      priority_weight: number
    }>

  if (updates.length === 0) {
    return
  }

  for (const update of updates) {
    const { error } = await supabaseAdminClient
      .from('sources')
      .update({
        avg_clip_score: update.avg_clip_score,
        total_clips_generated: update.total_clips_generated,
        priority_weight: update.priority_weight,
      })
      .eq('id', update.id)

    if (error) {
      throw new Error(error.message)
    }
  }
}

async function fetchLatestVideosFromSource(source: SourceRow) {
  const channelUrl = source.channel_url?.trim() || source.url?.trim()
  if (!channelUrl) {
    return []
  }

  const { stdout } = await runCommand('yt-dlp', [
    '--flat-playlist',
    '--playlist-end',
    String(MAX_VIDEOS_PER_SOURCE),
    '--dump-json',
    channelUrl,
  ])

  const weight = toNumber(source.priority_weight) || 1

  return stdout
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean)
    .map((line: string) => JSON.parse(line) as Record<string, unknown>)
    .map((entry: Record<string, unknown>) => {
      const id = typeof entry.id === 'string' ? entry.id.trim() : ''
      const title = typeof entry.title === 'string' ? entry.title.trim() : ''
      const durationSeconds =
        typeof entry.duration === 'number'
          ? entry.duration
          : typeof entry.duration === 'string'
            ? Number(entry.duration)
            : 0
      const keywordScore = countKeywordMatches(title)

      return {
        videoId: id,
        title,
        durationSeconds,
        videoUrl: id ? buildWatchUrl(id) : '',
        keywordScore,
        source,
        priorityScore: Number((weight + keywordScore * 0.35).toFixed(2)),
      } satisfies PlaylistVideo
    })
    .filter((video: PlaylistVideo) => video.videoId && video.videoUrl && video.title)
}

async function storeProcessedVideo(input: PlaylistVideo, status: 'queued' | 'skipped') {
  const { error } = await supabaseAdminClient.from('processed_videos').upsert(
    {
      source_id: input.source.id,
      channel_id: input.source.channel_id,
      video_id: input.videoId,
      video_url: input.videoUrl,
      title: input.title,
      duration_seconds: Math.round(input.durationSeconds),
      keyword_score: input.keywordScore,
      ingestion_score: input.priorityScore,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'video_id' },
  )

  if (error) {
    throw new Error(error.message)
  }
}

async function markSourceIngested(sourceId: string) {
  const { error } = await supabaseAdminClient
    .from('sources')
    .update({ last_ingested_at: new Date().toISOString() })
    .eq('id', sourceId)

  if (error) {
    throw new Error(error.message)
  }
}

async function persistSourceRunStats(sourceId: string, stats: SourceRunStats) {
  const successRate =
    stats.fetched > 0 ? Number((stats.enqueued / stats.fetched).toFixed(4)) : 0

  const { error } = await supabaseAdminClient
    .from('sources')
    .update({
      last_run_at: new Date().toISOString(),
      last_ingested_at: new Date().toISOString(),
      videos_enqueued: stats.enqueued,
      success_rate: successRate,
    })
    .eq('id', sourceId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function runIngestion(requestedByUserId: string): Promise<IngestionSummary> {
  const sources = await listActiveSources()
  await rebalanceSourcePriorityWeights(sources)

  const seenVideoIds = await listProcessedVideoIds()
  const acceptedVideos: PlaylistVideo[] = []
  let videosFetched = 0
  let videosRejected = 0
  const sourceRunStats = new Map<string, SourceRunStats>()

  for (const source of sources) {
    try {
      const category = normalizeCategory(source.category)
      if (!category) {
        videosRejected += 1
        continue
      }

      const videos = await fetchLatestVideosFromSource(source)
      videosFetched += videos.length
      sourceRunStats.set(source.id, { fetched: videos.length, enqueued: 0 })

      for (const video of videos) {
        const duplicate =
          seenVideoIds.has(video.videoId) ||
          acceptedVideos.some((existing) => existing.videoId === video.videoId)

        if (
          duplicate ||
          shouldRejectVideo({
            durationSeconds: video.durationSeconds,
            keywordScore: video.keywordScore,
            sourcePriority: source.priority,
          })
        ) {
          videosRejected += 1
          if (!duplicate) {
            await storeProcessedVideo(video, 'skipped')
          }
          continue
        }

        acceptedVideos.push(video)
      }

      await markSourceIngested(source.id)
    } catch (error) {
      console.error('[source-ingestion] source failed', {
        sourceId: source.id,
        sourceName: source.channel_name,
        error: error instanceof Error ? error.message : String(error),
      })
      videosRejected += 1
      sourceRunStats.set(source.id, sourceRunStats.get(source.id) ?? { fetched: 0, enqueued: 0 })
    }
  }

  const prioritizedVideos = acceptedVideos
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, MAX_ENQUEUED_PER_RUN)

  const jobs: IngestionSummary['jobs'] = []

  for (const video of prioritizedVideos) {
    await storeProcessedVideo(video, 'skipped')
    await writeAuditLog({
      stage: 'SOURCE_INGESTION',
      actor: `system:${requestedByUserId}`,
      decision: 'AUTO_GENERATION_BLOCKED',
      reason: 'DIRECT_ENQUEUE_FROM_INGESTION_REQUIRES_HUMAN_SELECTION',
    })
    const currentStats = sourceRunStats.get(video.source.id) ?? { fetched: 0, enqueued: 0 }
    sourceRunStats.set(video.source.id, {
      fetched: currentStats.fetched,
      enqueued: currentStats.enqueued,
    })

    jobs.push({
      sourceId: video.source.id,
      sourceName: video.source.channel_name?.trim() || video.source.channel_url?.trim() || 'Source',
      videoId: video.videoId,
      videoUrl: video.videoUrl,
      channelId: video.source.channel_id,
      jobId: null,
    })
  }

  for (const source of sources) {
    await persistSourceRunStats(source.id, sourceRunStats.get(source.id) ?? { fetched: 0, enqueued: 0 })
  }

  return {
    total_sources: sources.length,
    videos_fetched: videosFetched,
    videos_rejected: videosRejected,
    videos_enqueued: jobs.length,
    jobs,
  }
}
