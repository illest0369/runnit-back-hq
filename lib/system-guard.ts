import { writeAuditLog } from './audit-log'
import { supabaseAdminClient } from './supabase-admin'

export type SystemGuardClip = {
  id?: string | null
  video_id?: string | null
  source_url?: string | null
  source_video_url?: string | null
  hook?: string | null
  caption?: string | null
  hashtags?: string[] | string | null
  duration_seconds?: number | null
  extended_cut?: boolean | null
  aspect_ratio?: string | null
  timestamp_start?: number | null
  timestamp_end?: number | null
  start_time?: number | null
  end_time?: number | null
}

export type SystemGuardResult = { ok: true } | { ok: false; reason: string }

export async function validateSystemGuard(clip: SystemGuardClip): Promise<SystemGuardResult> {
  const reason = await findGuardFailure(clip)

  if (reason) {
    await writeAuditLog({
      clip_id: clip.id ?? null,
      post_id: clip.id ?? null,
      stage: 'SYSTEM_GUARD',
      actor: 'system',
      decision: 'FAILED',
      reason,
    })
    return { ok: false, reason }
  }

  await writeAuditLog({
    clip_id: clip.id ?? null,
    post_id: clip.id ?? null,
    stage: 'SYSTEM_GUARD',
    actor: 'system',
    decision: 'PASSED',
  })

  return { ok: true }
}

async function findGuardFailure(clip: SystemGuardClip) {
  const hookWords = String(clip.hook ?? '').trim().split(/\s+/).filter(Boolean)
  if (hookWords.length > 10) {
    return 'HOOK_TOO_LONG'
  }

  const captionLines = String(clip.caption ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (captionLines.length > 2 || captionLines.some((line) => line.length > 120)) {
    return 'CAPTION_TOO_LONG'
  }

  const hashtags = normalizeHashtags(clip.hashtags)
  if (hashtags.length > 0 && (hashtags.length < 4 || hashtags.length > 6)) {
    return 'HASHTAG_COUNT_OUT_OF_RANGE'
  }

  const start = readNumber(clip.timestamp_start ?? clip.start_time)
  const end = readNumber(clip.timestamp_end ?? clip.end_time)
  if (start === null || end === null) {
    return 'MISSING_TIMESTAMPS'
  }

  const duration = readNumber(clip.duration_seconds) ?? end - start
  if (!clip.extended_cut && (duration < 6 || duration > 15)) {
    return 'DURATION_OUT_OF_RANGE'
  }

  if ((clip.aspect_ratio ?? '9:16') !== '9:16') {
    return 'INVALID_ASPECT_RATIO'
  }

  const sourceUrl = clip.source_url ?? clip.source_video_url
  if (!sourceUrl?.trim() || !readVideoId(clip)) {
    return 'MISSING_SOURCE_OR_VIDEO_ID'
  }

  if (await isDuplicateProcessedClip(clip, start, end)) {
    return 'DUPLICATE_PROCESSED_CLIP'
  }

  return null
}

function normalizeHashtags(value: SystemGuardClip['hashtags']) {
  if (Array.isArray(value)) {
    return value.map((tag) => tag.trim()).filter(Boolean)
  }

  if (typeof value !== 'string') {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.map((tag) => String(tag).trim()).filter(Boolean)
    }
  } catch {
    // Fall through to token parsing.
  }

  return value.split(/\s+/).map((tag) => tag.trim()).filter((tag) => tag.startsWith('#'))
}

function readNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function readVideoId(clip: SystemGuardClip) {
  if (clip.video_id?.trim()) {
    return clip.video_id.trim()
  }

  const url = clip.source_url ?? clip.source_video_url ?? ''
  return (
    url.match(/[?&]v=([^&]+)/)?.[1] ??
    url.match(/youtu\.be\/([^?]+)/)?.[1] ??
    url.match(/\/shorts\/([^?]+)/)?.[1] ??
    url.trim()
  )
}

async function isDuplicateProcessedClip(clip: SystemGuardClip, start: number, end: number) {
  const videoId = readVideoId(clip)
  const sourceUrl = clip.source_url ?? clip.source_video_url ?? ''

  try {
    let query = supabaseAdminClient
      .from('posts')
      .select('id')
      .eq('source_video_url', sourceUrl)
      .eq('start_time', start)
      .eq('end_time', end)
      .in('status', ['GUARDED', 'REVIEWED', 'AI_DECISION', 'APPROVED_BY_HUMAN', 'EXECUTED'])
      .limit(1)

    if (clip.id) {
      query = query.neq('id', clip.id)
    }

    const { data, error } = await query
    if (error) {
      console.error('[system-guard] duplicate lookup failed', error.message)
      return false
    }

    if (data?.length) {
      return true
    }

    return false
  } catch (error) {
    console.error('[system-guard] duplicate check unavailable', error)
    return false
  }
}
