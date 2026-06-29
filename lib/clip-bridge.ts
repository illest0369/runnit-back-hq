import type { SupabaseClient } from '@supabase/supabase-js'

export type ClipBridgeCandidate = {
  channel_id: string | null
  title: string | null
  source_url: string | null
  thumbnail_url: string | null
  video_url?: string | null
  external_id?: string | null
  source_name?: string | null
  score?: number | string | null
  created_at?: string | null
  import_batch_id?: string | null
}

export type ClipBridgeResult = {
  inserted_count: number
  skipped_count: number
  failed_count: number
  inserted: Array<{ id: string; channel_id: string | null }>
  skipped: Array<{ external_id: string | null; source_url: string | null; reason: string }>
  failed: Array<{ external_id: string | null; source_url: string | null; reason: string }>
}

type PendingClipRow = {
  channel_id: string
  external_id: string
  title: string
  hook: string
  source_name: string
  source_type: 'youtube'
  thumbnail_url: string
  video_url: string | null
  source_url: string
  original_platform: 'youtube'
  import_batch_id: string
  ai_score: number
  virality_score: number
  hook_strength: number
  sports_category: string | null
  recommended_hook: string
  moderation_notes: string[]
  risk_flags: string[]
  status: 'pending'
  publish_status: 'not_ready'
  ingested_at: string
  ingestion_status: 'imported'
  created_at?: string
  updated_at?: string
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif']
const DIRECT_MEDIA_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm']

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readScore(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 75
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function hasExtension(value: string, extensions: string[]): boolean {
  const url = safeUrl(value)
  const path = url?.pathname ?? value
  return extensions.some((extension) => path.toLowerCase().endsWith(extension))
}

function isUsableThumbnail(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true
  const url = safeUrl(value)
  return Boolean(url && ['http:', 'https:'].includes(url.protocol) && hasExtension(value, IMAGE_EXTENSIONS))
}

function isDirectPlayableMedia(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return hasExtension(value, DIRECT_MEDIA_EXTENSIONS)
  const url = safeUrl(value)
  if (!url || !['http:', 'https:'].includes(url.protocol)) return false
  return (
    hasExtension(value, DIRECT_MEDIA_EXTENSIONS) ||
    url.hostname.includes('googlevideo.com') ||
    url.pathname.includes('/videoplayback') ||
    url.pathname.toLowerCase().endsWith('.m3u8')
  )
}

export function readYouTubeVideoId(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null

  const url = safeUrl(raw)
  if (!url) return null

  if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] ?? null
  const watchId = url.searchParams.get('v')?.trim()
  if (watchId) return watchId
  return url.pathname.match(/\/shorts\/([^/?]+)/)?.[1]?.trim() ?? null
}

export function normalizeYouTubeWatchUrl(value: string | null | undefined): string | null {
  const videoId = readYouTubeVideoId(value)
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null
}

function toPendingClipRow(candidate: ClipBridgeCandidate, importBatchId: string): PendingClipRow | { reason: string } {
  const channelId = readString(candidate.channel_id)
  const title = readString(candidate.title)
  const sourceUrl = normalizeYouTubeWatchUrl(candidate.source_url)
  const thumbnailUrl = readString(candidate.thumbnail_url)
  const videoUrl = readString(candidate.video_url)
  const youtubeId = readYouTubeVideoId(sourceUrl)
  const externalId = readString(candidate.external_id) || (youtubeId ? `youtube:${youtubeId}` : '')

  if (!channelId) return { reason: 'missing_channel_id' }
  if (!title) return { reason: 'missing_title' }
  if (!sourceUrl) return { reason: 'missing_youtube_source_url' }
  if (!thumbnailUrl || !isUsableThumbnail(thumbnailUrl)) return { reason: 'missing_usable_thumbnail' }
  if (!externalId) return { reason: 'missing_external_id' }

  const moderationVideoUrl = videoUrl && isDirectPlayableMedia(videoUrl) ? videoUrl : null
  const needsRender = !moderationVideoUrl
  const now = new Date().toISOString()

  return {
    channel_id: channelId,
    external_id: externalId,
    title,
    hook: title.length <= 74 ? title : `${title.slice(0, 71).trim()}...`,
    source_name: readString(candidate.source_name) || 'YouTube',
    source_type: 'youtube',
    thumbnail_url: thumbnailUrl,
    video_url: moderationVideoUrl,
    source_url: sourceUrl,
    original_platform: 'youtube',
    import_batch_id: readString(candidate.import_batch_id) || importBatchId,
    ai_score: readScore(candidate.score),
    virality_score: readScore(candidate.score),
    hook_strength: readScore(candidate.score),
    sports_category: null,
    recommended_hook: title,
    moderation_notes: ['Created from sourced queue content for unified clips moderation.'],
    risk_flags: needsRender ? ['needs_clip_render'] : [],
    status: 'pending',
    publish_status: 'not_ready',
    ingested_at: now,
    ingestion_status: 'imported',
    created_at: candidate.created_at ?? undefined,
    updated_at: now,
  }
}

async function existingValues(
  supabase: SupabaseClient,
  column: 'external_id' | 'video_url',
  values: string[],
): Promise<Set<string>> {
  const uniqueValues = [...new Set(values.filter(Boolean))]
  if (uniqueValues.length === 0) return new Set()

  const existing = new Set<string>()
  for (let index = 0; index < uniqueValues.length; index += 100) {
    const batch = uniqueValues.slice(index, index + 100)
    const { data, error } = await supabase
      .from('clips')
      .select(column)
      .in(column, batch)

    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const value = readString((row as Record<string, unknown>)[column])
      if (value) existing.add(value)
    }
  }

  return existing
}

function isMissingColumnError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('column') && message.includes('does not exist')
}

export async function insertPendingClipsFromSourcedContent(
  supabase: SupabaseClient,
  candidates: ClipBridgeCandidate[],
  input: { importBatchId?: string | null } = {},
): Promise<ClipBridgeResult> {
  const importBatchId = input.importBatchId?.trim() || `queue-bridge:${new Date().toISOString()}`
  const skipped: ClipBridgeResult['skipped'] = []
  const failed: ClipBridgeResult['failed'] = []
  const rows: PendingClipRow[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const row = toPendingClipRow(candidate, importBatchId)
    if ('reason' in row) {
      skipped.push({ external_id: candidate.external_id ?? null, source_url: candidate.source_url ?? null, reason: row.reason })
      continue
    }

    const batchKey = `${row.channel_id}\u0000${row.external_id}\u0000${row.source_url}`
    if (seen.has(batchKey)) {
      skipped.push({ external_id: row.external_id, source_url: row.source_url, reason: 'duplicate_in_batch' })
      continue
    }

    seen.add(batchKey)
    rows.push(row)
  }

  if (rows.length === 0) {
    return { inserted_count: 0, skipped_count: skipped.length, failed_count: failed.length, inserted: [], skipped, failed }
  }

  const existingExternalIds = await existingValues(supabase, 'external_id', rows.map((row) => row.external_id))
  const existingVideoUrls = await existingValues(
    supabase,
    'video_url',
    rows.map((row) => row.video_url).filter((value): value is string => Boolean(value)),
  )
  const rowsToInsert = rows.filter((row) => {
    if (existingExternalIds.has(row.external_id) || (row.video_url && existingVideoUrls.has(row.video_url))) {
      skipped.push({ external_id: row.external_id, source_url: row.source_url, reason: 'duplicate_existing_clip' })
      return false
    }
    return true
  })

  if (rowsToInsert.length === 0) {
    return { inserted_count: 0, skipped_count: skipped.length, failed_count: failed.length, inserted: [], skipped, failed }
  }

  const inserted: ClipBridgeResult['inserted'] = []

  async function insertRows(batch: PendingClipRow[]): Promise<{
    data: Array<{ id: string; channel_id?: string | null }> | null
    error: { message: string } | null
  }> {
    let result = await supabase
      .from('clips')
      .insert(batch)
      .select('id, channel_id')

    if (isMissingColumnError(result.error)) {
      const withoutChannelId = batch.map((row) => {
        const { channel_id, ...rest } = row
        void channel_id
        return rest
      })
      result = await supabase
        .from('clips')
        .insert(withoutChannelId)
        .select('id')
    }

    return {
      data: result.data as Array<{ id: string; channel_id?: string | null }> | null,
      error: result.error,
    }
  }

  for (let index = 0; index < rowsToInsert.length; index += 50) {
    const batch = rowsToInsert.slice(index, index + 50)
    const result = await insertRows(batch)

    if (!result.error) {
      inserted.push(...(result.data ?? []).map((row) => ({
        id: row.id,
        channel_id: row.channel_id ?? null,
      })))
      continue
    }

    for (const row of batch) {
      const single = await insertRows([row])
      if (single.error) {
        failed.push({ external_id: row.external_id, source_url: row.source_url, reason: single.error.message })
      } else {
        inserted.push(...(single.data ?? []).map((insertedRow) => ({
          id: insertedRow.id,
          channel_id: insertedRow.channel_id ?? row.channel_id,
        })))
      }
    }
  }

  return {
    inserted_count: inserted.length,
    skipped_count: skipped.length,
    failed_count: failed.length,
    inserted,
    skipped,
    failed,
  }
}
