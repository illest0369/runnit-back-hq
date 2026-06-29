import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { scoreClipsWithGemini } from './gemini/scoring'
import type { GeminiScoreClipInput } from './gemini/score'
import { importClips } from './moderation-queue'
import {
  getCuratedSourceUrl,
  listCuratedSources,
  markSourcesIngestStartedBestEffort,
  updateSourcesIngestHealthBestEffort,
  type CuratedSourceRow,
} from './rbhq-source-ingest'
import { editorialScore, scoreSourceProfile } from './source-system'
import { supabaseAdminClient } from './supabase-admin'

const execFileAsync = promisify(execFile)
const MAX_SOURCES_PER_JOB = 20
const MAX_RSS_ITEMS_PER_SOURCE = 6
const YT_DLP_TIMEOUT_MS = 25_000

type RssEntry = {
  externalId: string
  title: string
  canonicalUrl: string
  publishedAt: string | null
  thumbnailUrl: string | null
}

type EnrichedVideo = RssEntry & {
  source: CuratedSourceRow
  uploader: string | null
  durationSeconds: number | null
  playableUrl: string | null
  thumbnailUrl: string | null
  rawPayload: Record<string, unknown>
}

type NativeClipInput = GeminiScoreClipInput & {
  channel_id: string
  video_url: string
  thumbnail_url: string
  source_type: string
  import_batch_id: string
  aspect_ratio: string
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function sourcePriority(source: CuratedSourceRow): number {
  return Math.max(1, Math.round((source.source_system_score ?? scoreSourceProfile(null, numberValue(source.priority_weight) ?? 1)) / 20))
}

function normalizeUploadDate(value: string | null): string | null {
  if (!value) return null
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function readYouTubeChannelId(value: string): string | null {
  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(value)) return value
  return value.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/)?.[1] ?? null
}

function readYouTubeVideoId(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] ?? null
    if (url.searchParams.get('v')) return url.searchParams.get('v')
    const shorts = url.pathname.match(/\/shorts\/([^/?]+)/)?.[1]
    if (shorts) return shorts
  } catch {
    return null
  }
  return null
}

function isDirectVideoUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return Boolean(
      url.searchParams.get('v') ||
      url.hostname.includes('youtu.be') ||
      url.pathname.includes('/shorts/') ||
      url.pathname.includes('/video/') ||
      url.pathname.includes('/reel/'),
    )
  } catch {
    return false
  }
}

function isYouTubeUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname.includes('youtube.com') || hostname.includes('youtu.be')
  } catch {
    return false
  }
}

function platformForUrl(value: string): 'youtube' | 'tiktok' | 'instagram' | 'reddit' {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    if (hostname.includes('tiktok')) return 'tiktok'
    if (hostname.includes('instagram')) return 'instagram'
    if (hostname.includes('reddit')) return 'reddit'
  } catch {
    return 'youtube'
  }
  return 'youtube'
}

async function resolveYouTubeChannelId(source: CuratedSourceRow): Promise<string | null> {
  const raw = getCuratedSourceUrl(source)
  const direct = readYouTubeChannelId(raw)
  if (direct) return direct
  if (!raw || isDirectVideoUrl(raw)) return null

  const response = await fetch(raw, {
    headers: { 'user-agent': 'runnitback-rss-ingest/1.0' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) return null

  const html = await response.text()
  return html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/)?.[1] ?? null
}

async function fetchYouTubeRss(channelId: string): Promise<RssEntry[]> {
  const response = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
    {
      headers: { 'user-agent': 'runnitback-rss-ingest/1.0' },
      signal: AbortSignal.timeout(12_000),
    },
  )
  if (!response.ok) {
    throw new Error(`YOUTUBE_RSS_${response.status}`)
  }

  const xml = await response.text()
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map((entry) => {
      const body = entry[1] ?? ''
      const externalId = body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim() ?? ''
      const title = decodeXml(body.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '')
      const publishedAt = body.match(/<published>([^<]+)<\/published>/)?.[1]?.trim() ?? null
      const thumbnailUrl = decodeXml(
        body.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1]?.trim() ?? '',
      ) || null

      return {
        externalId,
        title,
        canonicalUrl: externalId ? `https://www.youtube.com/watch?v=${externalId}` : '',
        publishedAt,
        thumbnailUrl,
      }
    })
    .filter((entry) => entry.externalId && entry.title && entry.canonicalUrl)
}

async function runYtDlp(url: string): Promise<Record<string, unknown>> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        'yt-dlp',
        [
          '--dump-json',
          '--no-playlist',
          '--no-warnings',
          '--socket-timeout',
          '10',
          '--retries',
          '1',
          url,
        ],
        { timeout: YT_DLP_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      )
      return JSON.parse(stdout) as Record<string, unknown>
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('YT_DLP_FAILED')
}

function pickPlayableUrl(metadata: Record<string, unknown>): string | null {
  const direct = stringValue(metadata.url)
  if (direct?.startsWith('http')) return direct

  const formats = Array.isArray(metadata.formats) ? metadata.formats : []
  for (const format of formats as Array<Record<string, unknown>>) {
    const url = stringValue(format.url)
    const vcodec = stringValue(format.vcodec)
    if (url?.startsWith('http') && vcodec && vcodec !== 'none') return url
  }

  return null
}

function thumbnailFromMetadata(metadata: Record<string, unknown>, fallback: string | null) {
  const thumbnail = stringValue(metadata.thumbnail)
  if (thumbnail) return thumbnail
  const thumbnails = Array.isArray(metadata.thumbnails) ? metadata.thumbnails : []
  const best = [...(thumbnails as Array<Record<string, unknown>>)]
    .reverse()
    .map((item) => stringValue(item.url))
    .find(Boolean)
  return best ?? fallback
}

async function enrichEntry(source: CuratedSourceRow, entry: RssEntry): Promise<EnrichedVideo> {
  try {
    const metadata = await runYtDlp(entry.canonicalUrl)
    const externalId = stringValue(metadata.id) ?? entry.externalId
    const canonicalUrl = stringValue(metadata.webpage_url) ?? entry.canonicalUrl
    return {
      ...entry,
      externalId,
      canonicalUrl,
      title: stringValue(metadata.title) ?? entry.title,
      source,
      uploader: stringValue(metadata.uploader) ?? stringValue(metadata.channel),
      durationSeconds: numberValue(metadata.duration),
      playableUrl: pickPlayableUrl(metadata),
      thumbnailUrl: thumbnailFromMetadata(metadata, entry.thumbnailUrl),
      rawPayload: metadata,
    }
  } catch (error) {
    return {
      ...entry,
      source,
      uploader: source.channel_name,
      durationSeconds: null,
      playableUrl: null,
      thumbnailUrl: entry.thumbnailUrl,
      rawPayload: {
        canonical_url: entry.canonicalUrl,
        yt_dlp_error: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

async function sourceEntries(source: CuratedSourceRow): Promise<RssEntry[]> {
  const sourceUrl = getCuratedSourceUrl(source)
  if (!sourceUrl) return []

  const directVideoId = readYouTubeVideoId(sourceUrl)
  if (directVideoId || isDirectVideoUrl(sourceUrl)) {
    return [{
      externalId: directVideoId ?? sourceUrl,
      title: source.channel_name?.trim() || sourceUrl,
      canonicalUrl: directVideoId ? `https://www.youtube.com/watch?v=${directVideoId}` : sourceUrl,
      publishedAt: null,
      thumbnailUrl: null,
    }]
  }

  if (source.platform !== 'youtube' && !isYouTubeUrl(sourceUrl)) return []

  const channelId = await resolveYouTubeChannelId(source)
  if (!channelId) return []

  return (await fetchYouTubeRss(channelId)).slice(0, MAX_RSS_ITEMS_PER_SOURCE)
}

function toSourceItem(video: EnrichedVideo) {
  const platform = platformForUrl(video.canonicalUrl)
  return {
    source_platform: platform,
    source_url: video.canonicalUrl,
    source_external_id: video.externalId,
    title: video.title,
    creator: video.uploader ?? video.source.channel_name,
    duration_seconds: video.durationSeconds ? Math.round(video.durationSeconds) : null,
    views: numberValue(video.rawPayload.view_count) ?? 0,
    likes: numberValue(video.rawPayload.like_count) ?? 0,
    comments: numberValue(video.rawPayload.comment_count) ?? 0,
    upload_date: normalizeUploadDate(stringValue(video.rawPayload.upload_date) ?? video.publishedAt),
    raw_payload: {
      ...video.rawPayload,
      ingest_status: video.playableUrl ? 'enriched' : 'discovered',
      canonical_url: video.canonicalUrl,
      thumbnail_url: video.thumbnailUrl,
      source_id: video.source.id,
    },
  }
}

function toClip(video: EnrichedVideo, importBatchId: string): NativeClipInput | null {
  if (!video.playableUrl || !video.thumbnailUrl || !video.durationSeconds) return null
  const platform = platformForUrl(video.canonicalUrl)

  return {
    channel_id: video.source.channel_id,
    external_id: video.externalId,
    title: video.title,
    hook: video.title.length <= 74 ? video.title : `${video.title.slice(0, 71).trim()}...`,
    source_name: video.uploader ?? video.source.channel_name ?? 'YouTube',
    source_type: platform,
    thumbnail_url: video.thumbnailUrl,
    video_url: video.playableUrl,
    source_url: video.canonicalUrl,
    original_platform: platform,
    import_batch_id: importBatchId,
    duration_seconds: Math.max(1, Math.round(video.durationSeconds)),
    ai_score: editorialScore({
      title: video.title,
      sourceName: video.uploader ?? video.source.channel_name,
      channelId: video.source.channel_id,
      sourceScore: Math.max(0, Math.min(100, Math.round(sourcePriority(video.source) * 20))),
      publishedAt: video.publishedAt,
    }),
    aspect_ratio: '9:16',
  }
}

async function existingExternalIds(externalIds: string[]) {
  if (externalIds.length === 0) return new Set<string>()
  const { data, error } = await supabaseAdminClient
    .from('rbhq_source_items')
    .select('source_external_id')
    .in('source_external_id', externalIds)

  if (error) throw new Error(error.message)
  return new Set(
    (data ?? [])
      .map((row: { source_external_id: string | null }) => row.source_external_id)
      .filter((value): value is string => Boolean(value)),
  )
}

async function upsertNativeSourceItems(videos: EnrichedVideo[]) {
  if (videos.length === 0) return 0
  const rows = videos.map(toSourceItem)
  const { error } = await supabaseAdminClient
    .from('rbhq_source_items')
    .upsert(rows, { onConflict: 'source_url' })

  if (error) throw new Error(error.message)
  return rows.length
}

export async function runNativeRbhqIngest(input: { sourceIds?: string[]; limit?: number }) {
  const sources = (await listCuratedSources({
    sourceIds: input.sourceIds,
    limit: Math.min(MAX_SOURCES_PER_JOB, Math.max(1, input.limit ?? MAX_SOURCES_PER_JOB)),
  })).slice(0, MAX_SOURCES_PER_JOB)
  const sourceIds = sources.map((source) => source.id)
  await markSourcesIngestStartedBestEffort(sourceIds)

  const discovered: EnrichedVideo[] = []
  const sourceResults: Array<{ sourceId: string; discovered: number; enriched: number; error: string | null }> = []

  for (const source of sources) {
    const result = { sourceId: source.id, discovered: 0, enriched: 0, error: null as string | null }
    try {
      const entries = await sourceEntries(source)
      result.discovered = entries.length
      const duplicateIds = await existingExternalIds(entries.map((entry) => entry.externalId))
      for (const entry of entries.filter((candidate) => !duplicateIds.has(candidate.externalId))) {
        const enriched = await enrichEntry(source, entry)
        if (enriched.playableUrl) result.enriched += 1
        discovered.push(enriched)
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
    }
    sourceResults.push(result)
  }

  const storedCount = await upsertNativeSourceItems(discovered)
  const importBatchId = `native:${new Date().toISOString()}`
  const candidates = discovered
    .map((video) => ({ video, clip: toClip(video, importBatchId) }))
    .filter((item): item is { video: EnrichedVideo; clip: NativeClipInput } => Boolean(item.clip))
    .sort((left, right) => {
      const leftTime = Date.parse(left.video.publishedAt ?? '') || 0
      const rightTime = Date.parse(right.video.publishedAt ?? '') || 0
      return sourcePriority(right.video.source) - sourcePriority(left.video.source) || rightTime - leftTime
    })
  const candidateOrdering = new Map(
    candidates.map((candidate) => [
      candidate.clip.external_id,
      {
        publishedAt: Date.parse(candidate.video.publishedAt ?? '') || 0,
        sourcePriority: sourcePriority(candidate.video.source),
      },
    ]),
  )

  const scored = await scoreClipsWithGemini(candidates.map((candidate) => candidate.clip))
  const clipsForImport = scored.scored.length > 0
    ? scored.scored
    : candidates.map((candidate) => ({
        ...candidate.clip,
        virality_score: candidate.clip.ai_score ?? 0,
        hook_strength: candidate.clip.ai_score ?? 0,
        emotion: 'unknown',
        sports_category: candidate.clip.sport ?? 'sports',
        recommended_hook: candidate.clip.hook ?? candidate.clip.title,
        risk_flags: ['gemini_unavailable_fallback'],
        moderation_notes: ['Gemini scoring was unavailable during ingest; queued with source-priority score.'],
        gemini_processed_at: null,
      }))

  clipsForImport.sort((left, right) => {
    const scoreDelta = Number(right.ai_score ?? 0) - Number(left.ai_score ?? 0)
    if (scoreDelta !== 0) return scoreDelta
    const leftOrdering = candidateOrdering.get(left.external_id)
    const rightOrdering = candidateOrdering.get(right.external_id)
    const recencyDelta = Number(rightOrdering?.publishedAt ?? 0) - Number(leftOrdering?.publishedAt ?? 0)
    if (recencyDelta !== 0) return recencyDelta
    return Number(rightOrdering?.sourcePriority ?? 0) - Number(leftOrdering?.sourcePriority ?? 0)
  })
  const imported = clipsForImport.length > 0
    ? await importClips({ clips: clipsForImport, importBatchId })
    : { inserted_count: 0, skipped_count: 0, failed_count: 0, validation_errors: [], inserted: [], skipped: [] }

  await updateSourcesIngestHealthBestEffort({
    sourceIds,
    fetched: discovered.length,
    imported: imported.inserted_count,
    success: sourceResults.some((result) => !result.error),
  })

  return {
    sources: sources.length,
    discovered: discovered.length,
    stored: storedCount,
    scored: scored.scored.length,
    scoreFailed: scored.failed.length,
    imported: imported.inserted_count,
    skipped: imported.skipped_count,
    failed: imported.failed_count,
    sourceResults,
  }
}
