export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { randomUUID, timingSafeEqual } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import { supabaseAdmin } from '@/lib/supabase'
import { isWarRoomEnabled } from '@/lib/war-room-runtime'

const YT_BASE = 'https://www.googleapis.com/youtube/v3'
const ESPN_CHANNEL_ID = 'UCiWLfSweyRNmLpgEHekhoAg'
const SPORTS_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000001'
const RATE_LIMIT_WINDOW_MS = 15_000

declare global {
  var __runnitBackYoutubeIngestLastRun: number | undefined
}

type YouTubeSearchItem = {
  id?: {
    videoId?: string
  }
  snippet?: {
    title?: string
    publishedAt?: string
    thumbnails?: {
      high?: { url?: string }
      medium?: { url?: string }
      default?: { url?: string }
    }
  }
}

type YouTubeSearchResponse = {
  items?: YouTubeSearchItem[]
  error?: {
    message?: string
  }
}

type QueueCandidate = {
  url: string
  title: string
  thumbnail: string | null
  publishedAt: string | null
  isShort: boolean
}

export async function POST(request: NextRequest) {
  if (!isWarRoomEnabled()) {
    return NextResponse.json({ ok: false, error: 'WAR_ROOM_DISABLED' }, { status: 503 })
  }

  const runKey = request.headers.get('x-idempotency-key')?.trim() || null

  try {
    const secretAuthorized = isValidIngestSecret(request.headers.get('x-ingest-secret'))
    if (!secretAuthorized) {
      const session = await getSessionFromRequest(request)
      if (!session) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      }

      if (!validateCsrfRequest(request)) {
        return NextResponse.json({ ok: false, error: 'Invalid CSRF token.' }, { status: 403 })
      }

      if (session.role !== 'admin' && !session.channelIds.includes(SPORTS_CHANNEL_ID)) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
      }
    }

    const now = Date.now()
    const lastRun = globalThis.__runnitBackYoutubeIngestLastRun ?? 0
    if (now - lastRun < RATE_LIMIT_WINDOW_MS) {
      return NextResponse.json({ ok: false, error: 'Rate limited' }, { status: 429 })
    }
    globalThis.__runnitBackYoutubeIngestLastRun = now

    if (runKey && await hasCompletedRun(runKey)) {
      return NextResponse.json(
        { ok: true, inserted: 0, skipped: 0, total_candidates: 0, deduped: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const apiKey = process.env.YOUTUBE_API_KEY?.trim()
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'YOUTUBE_API_KEY is required.' }, { status: 500 })
    }

    const body = (await request.json().catch(() => ({}))) as { channelId?: string }
    const youtubeChannelId = body.channelId?.trim() || ESPN_CHANNEL_ID

    const response = await fetch(
      `${YT_BASE}/search?key=${encodeURIComponent(apiKey)}&channelId=${encodeURIComponent(youtubeChannelId)}&part=snippet&order=date&maxResults=20&type=video`,
      { cache: 'no-store' },
    )

    const data = (await response.json()) as YouTubeSearchResponse
    if (!response.ok) {
      throw new Error(data.error?.message || `YouTube API returned ${response.status}.`)
    }

    const candidates = (data.items ?? [])
      .map(toQueueCandidate)
      .filter((candidate): candidate is QueueCandidate => Boolean(candidate))
      .filter((candidate) => !shouldSkipVideo(candidate.title))

    if (candidates.length === 0) {
      await logYtIngestEvent({
        runKey,
        inserted: 0,
        skipped: 0,
        totalCandidates: 0,
        channelId: youtubeChannelId,
      })

      return NextResponse.json(
        { ok: true, inserted: 0, skipped: 0, total_candidates: 0 },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const existingUrls = await getExistingSourceUrls(candidates.map((candidate) => candidate.url))
    const newCandidates = candidates.filter((candidate) => !existingUrls.has(candidate.url))

    if (newCandidates.length === 0) {
      await logYtIngestEvent({
        runKey,
        inserted: 0,
        skipped: candidates.length,
        totalCandidates: candidates.length,
        channelId: youtubeChannelId,
      })

      return NextResponse.json(
        { ok: true, inserted: 0, skipped: candidates.length, total_candidates: candidates.length },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const inserted = await persistQueueCandidates(newCandidates)
    await logYtIngestEvent({
      runKey,
      inserted,
      skipped: candidates.length - inserted,
      totalCandidates: candidates.length,
      channelId: youtubeChannelId,
    })

    return NextResponse.json(
      {
        ok: true,
        inserted,
        skipped: candidates.length - inserted,
        total_candidates: candidates.length,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'YouTube ingest failed.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

async function hasCompletedRun(runKey: string) {
  const { data, error } = await supabaseAdmin
    .from('publish_events')
    .select('id')
    .eq('event_type', 'yt_ingest')
    .eq('payload->>runKey', runKey)
    .limit(1)

  if (error) {
    console.warn('[yt-ingest] idempotency lookup skipped', error.message)
    return false
  }

  return Boolean(data?.length)
}

function toQueueCandidate(item: YouTubeSearchItem): QueueCandidate | null {
  const videoId = item.id?.videoId?.trim()
  if (!videoId) {
    return null
  }

  const title = item.snippet?.title?.trim() || 'Untitled YouTube video'
  const isShort = title.toLowerCase().includes('#shorts')

  return {
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    thumbnail:
      item.snippet?.thumbnails?.high?.url ??
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      null,
    publishedAt: item.snippet?.publishedAt ?? null,
    isShort,
  }
}

async function getExistingSourceUrls(urls: string[]) {
  if (urls.length === 0) {
    return new Set<string>()
  }

  const { data, error } = await supabaseAdmin
    .from('queue_jobs')
    .select('source_url')
    .in('source_url', urls)

  if (error) {
    throw new Error(error.message)
  }

  return new Set(
    (data ?? [])
      .map((row: { source_url: string | null }) => row.source_url?.trim())
      .filter((value): value is string => Boolean(value)),
  )
}

function shouldSkipVideo(title: string) {
  const normalizedTitle = title.toLowerCase()
  return normalizedTitle.includes('live')
}

function isValidIngestSecret(candidate: string | null) {
  const expected = process.env.INGEST_SECRET?.trim()
  if (!candidate || !expected) {
    return false
  }

  const candidateBuffer = Buffer.from(candidate.trim())
  const expectedBuffer = Buffer.from(expected)

  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  )
}

async function persistQueueCandidates(candidates: QueueCandidate[]) {
  const now = new Date().toISOString()
  const score = 75
  const queueRows = candidates.map((candidate) => ({
    id: randomUUID(),
    channel_id: SPORTS_CHANNEL_ID,
    user_id: null,
    source_url: candidate.url,
    clip_url: null,
    score,
    status: 'queued',
    post_package: {
      title: candidate.title,
      thumbnail: candidate.thumbnail,
      source_name: 'ESPN',
      source: 'youtube:api',
      priority: 'main',
      published_at: candidate.publishedAt,
      is_short: candidate.isShort,
    },
    created_at: now,
  }))

  const { data: insertedQueueRows, error: queueError } = await supabaseAdmin
    .from('queue_jobs')
    .insert(queueRows)
    .select('id, source_url, post_package')

  if (queueError || !insertedQueueRows) {
    throw new Error(queueError?.message || 'queue insert failed')
  }

  const posts = insertedQueueRows.map((queueRow) => {
    const postPackage = queueRow.post_package as {
      title?: string
      thumbnail?: string | null
    } | null
    const sourceUrl = String(queueRow.source_url || '')

    return {
      id: randomUUID(),
      clip_id: queueRow.id,
      channel_id: SPORTS_CHANNEL_ID,
      platform: 'tiktok',
      destination: 'manual',
      caption: '',
      video_url: sourceUrl,
      source_video_url: sourceUrl,
      hook: postPackage?.title?.trim() || 'Untitled YouTube video',
      hashtags: [],
      score,
      status: 'queued',
      comment_count_hint: 0,
      priority_score: score,
      thumbnail_url: postPackage?.thumbnail ?? null,
      review_status: 'needs_review',
      created_at: now,
      updated_at: now,
    }
  })

  const { error: postError } = await supabaseAdmin.from('posts').insert(posts)

  if (postError) {
    await supabaseAdmin
      .from('queue_jobs')
      .delete()
      .in('id', queueRows.map((row) => row.id))
    throw new Error(postError.message)
  }

  return insertedQueueRows.length
}

async function logYtIngestEvent(input: {
  runKey: string | null
  inserted: number
  skipped: number
  totalCandidates: number
  channelId: string
}) {
  const { error } = await supabaseAdmin.from('publish_events').insert({
    event_type: 'yt_ingest',
    payload: {
      runKey: input.runKey,
      inserted: input.inserted,
      skipped: input.skipped,
      total_candidates: input.totalCandidates,
      channelId: input.channelId,
    },
    success: true,
  })

  if (error) {
    console.warn('[yt-ingest] publish event log skipped', error.message)
  }
}
