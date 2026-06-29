export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'

import { insertPendingClipsFromSourcedContent } from '@/lib/clip-bridge'
import { supabaseAdmin } from '@/lib/supabase'
import { isWarRoomEnabled } from '@/lib/war-room-runtime'

type SourceRow = {
  id: string
  channel_id: string
  url: string | null
  name: string | null
  handle: string | null
}

type FeedVideo = {
  id: string
  title: string
  url: string
  thumbnail: string | null
  publishedAt: string | null
}

const MAX_SOURCES_PER_RUN = 20
const MAX_INSERTS_PER_SOURCE = 3
const MAX_INSERTS_PER_RUN = 30
const SOURCE_SELECT_LIMIT = 100

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return false
  }

  const header = request.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function readChannelId(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) {
    return null
  }

  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(raw)) {
    return raw
  }

  const match = raw.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/)
  return match?.[1] ?? null
}

function readHandle(source: SourceRow): string | null {
  const raw = source.handle?.trim() || source.url?.trim() || ''
  const match = raw.match(/@([a-zA-Z0-9._-]+)/)
  return match?.[1] ?? null
}

async function resolveChannelId(source: SourceRow): Promise<string | null> {
  const direct = readChannelId(source.url) ?? readChannelId(source.handle)
  if (direct) {
    return direct
  }

  const handle = readHandle(source)
  if (!handle) {
    return null
  }

  const response = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
    headers: { 'user-agent': 'runnitback-ingest/1.0' },
  })

  if (!response.ok) {
    return null
  }

  const html = await response.text()
  return html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/)?.[1] ?? null
}

async function fetchFeedVideos(channelId: string): Promise<FeedVideo[]> {
  const response = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
    { headers: { 'user-agent': 'runnitback-ingest/1.0' } },
  )

  if (!response.ok) {
    throw new Error(`YouTube feed returned ${response.status}`)
  }

  const xml = await response.text()
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((entry) => {
    const body = entry[1] ?? ''
    const id = body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim() ?? ''
    const title = decodeXml(body.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '')
    const publishedAt = body.match(/<published>([^<]+)<\/published>/)?.[1]?.trim() ?? null
    const thumbnail = decodeXml(
      body.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1]?.trim() ?? '',
    ) || null

    return {
      id,
      title,
      url: id ? `https://www.youtube.com/watch?v=${id}` : '',
      thumbnail,
      publishedAt,
    }
  }).filter((video) => video.id && video.title && video.url)
}

async function existingSourceUrls() {
  const { data, error } = await supabaseAdmin
    .from('queue_jobs')
    .select('source_url')

  if (error) {
    throw new Error(error.message)
  }

  return new Set(
    (data ?? [])
      .map((row: { source_url: string | null }) => row.source_url?.trim())
      .filter((value): value is string => Boolean(value)),
  )
}

function balancedSourcesByChannel(sources: SourceRow[], limit: number): SourceRow[] {
  const groups = new Map<string, SourceRow[]>()
  for (const source of sources) {
    const channelSources = groups.get(source.channel_id) ?? []
    channelSources.push(source)
    groups.set(source.channel_id, channelSources)
  }

  const balanced: SourceRow[] = []
  while (balanced.length < limit && [...groups.values()].some((group) => group.length > 0)) {
    for (const group of groups.values()) {
      const next = group.shift()
      if (next) {
        balanced.push(next)
        if (balanced.length >= limit) break
      }
    }
  }

  return balanced
}

async function persistVideo(source: SourceRow, video: FeedVideo) {
  const now = new Date().toISOString()
  const queueJobId = randomUUID()
  const postId = randomUUID()
  const score = 75

  const { error: queueError } = await supabaseAdmin.from('queue_jobs').insert({
    id: queueJobId,
    channel_id: source.channel_id,
    user_id: null,
    source_url: video.url,
    clip_url: null,
    score,
    status: 'SOURCED',
    post_package: {
      title: video.title,
      thumbnail: video.thumbnail,
      source_name: source.name ?? source.handle ?? source.url,
      published_at: video.publishedAt,
      source: 'cron-ingest',
    },
    created_at: now,
  })

  if (queueError) {
    throw new Error(queueError.message)
  }

  const { error: postError } = await supabaseAdmin.from('posts').insert({
    id: postId,
    clip_id: queueJobId,
    channel_id: source.channel_id,
    platform: 'tiktok',
    destination: 'manual',
    caption: '',
    video_url: video.url,
    source_video_url: video.url,
    hook: video.title,
    hashtags: [],
    score,
    status: 'SOURCED',
    comment_count_hint: 0,
    priority_score: score,
    thumbnail_url: video.thumbnail,
    review_status: 'needs_review',
    created_at: now,
    updated_at: now,
  })

  if (postError) {
    await supabaseAdmin.from('queue_jobs').delete().eq('id', queueJobId)
    throw new Error(postError.message)
  }

  const clipResult = await insertPendingClipsFromSourcedContent(
    supabaseAdmin,
    [{
      channel_id: source.channel_id,
      title: video.title,
      source_url: video.url,
      video_url: null,
      thumbnail_url: video.thumbnail,
      external_id: `cron:${video.id}`,
      source_name: source.name ?? source.handle ?? source.url ?? 'YouTube',
      score,
      created_at: now,
      import_batch_id: `cron:${now.slice(0, 10)}`,
    }],
    { importBatchId: `cron:${now.slice(0, 10)}` },
  )

  if (clipResult.failed_count > 0) {
    throw new Error(clipResult.failed.map((failure) => failure.reason).join('; ') || 'clip insert failed')
  }

  return clipResult.inserted_count
}

async function runIngest() {
  const { data: sources, error } = await supabaseAdmin
    .from('sources')
    .select('id, channel_id, url, name, handle')
    .eq('platform', 'youtube')
    .eq('active', true)
    .eq('auto_ingest', true)
    .limit(SOURCE_SELECT_LIMIT)

  if (error) {
    throw new Error(error.message)
  }

  const selectedSources = balancedSourcesByChannel((sources ?? []) as SourceRow[], MAX_SOURCES_PER_RUN)
  const seen = await existingSourceUrls()
  const results = []
  let inserted = 0
  let clipsInserted = 0
  let skipped = 0

  for (const source of selectedSources) {
    const sourceResult = {
      source_id: source.id,
      source: source.name ?? source.handle ?? source.url,
      inserted: 0,
      clips_inserted: 0,
      skipped: 0,
      error: null as string | null,
    }

    try {
      const channelId = await resolveChannelId(source)
      if (!channelId) {
        sourceResult.error = 'Unable to resolve YouTube channel ID'
        results.push(sourceResult)
        continue
      }

      const videos = await fetchFeedVideos(channelId)
      for (const video of videos) {
        if (inserted >= MAX_INSERTS_PER_RUN || sourceResult.inserted >= MAX_INSERTS_PER_SOURCE) {
          break
        }

        if (seen.has(video.url)) {
          skipped += 1
          sourceResult.skipped += 1
          continue
        }

        const clipInserted = await persistVideo(source, video)
        seen.add(video.url)
        inserted += 1
        clipsInserted += clipInserted
        sourceResult.inserted += 1
        sourceResult.clips_inserted += clipInserted
      }
    } catch (error) {
      sourceResult.error = error instanceof Error ? error.message : String(error)
    }

    results.push(sourceResult)
    skipped += sourceResult.skipped

    if (inserted >= MAX_INSERTS_PER_RUN) {
      break
    }
  }

  return {
    ok: inserted > 0 || results.some((result) => result.skipped > 0),
    inserted,
    clips_inserted: clipsInserted,
    skipped,
    sources: selectedSources.length,
    available_sources: sources?.length ?? 0,
    results,
  }
}

async function handleCron(request: Request) {
  if (!isWarRoomEnabled()) {
    return NextResponse.json({ ok: false, error: 'WAR_ROOM_DISABLED' }, { status: 503 })
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await runIngest(), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unexpected ingest error',
      },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return handleCron(request)
}

export async function POST(request: Request) {
  return handleCron(request)
}
