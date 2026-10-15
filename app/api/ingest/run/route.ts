import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { NextResponse } from 'next/server'

import { validateCsrfRequest } from '@/lib/csrf'
import { resolveApifyToken } from '@/lib/apify/client'
import { getSessionFromRequest } from '@/lib/auth'
import { buildCuratedSourceJobs, listCuratedSources, type RbhqIngestMode } from '@/lib/rbhq-source-ingest'

export const dynamic = 'force-dynamic'

type IngestPlatform = keyof typeof ACTORS

const ACTORS = {
  youtube: process.env.APIFY_YOUTUBE_ACTOR_ID,
  tiktok: process.env.APIFY_TIKTOK_ACTOR_ID,
  instagram: process.env.APIFY_INSTAGRAM_ACTOR_ID,
  reddit: process.env.APIFY_REDDIT_ACTOR_ID,
} as const

const SOURCE_INPUTS = {
  youtube: {
    startUrls: [
      { url: 'https://www.youtube.com/@ESPN/videos' },
      { url: 'https://www.youtube.com/@FirstTake/videos' },
      { url: 'https://www.youtube.com/@ThePatMcAfeeShow/videos' },
    ],
    maxResults: 20,
  },
  tiktok: {
    searchQueries: ['nba reaction', 'nfl reaction', 'sports debate'],
    maxItems: 20,
  },
  reddit: {
    startUrls: [
      { url: 'https://www.reddit.com/r/nba/top/?t=day' },
      { url: 'https://www.reddit.com/r/nfl/top/?t=day' },
    ],
    maxItems: 20,
  },
  instagram: {
    searchQueries: ['sports reels', 'nba reels', 'football reels'],
    maxItems: 20,
  },
} as const

const execFileAsync = promisify(execFile)

function missingEnvForIngest(platform: IngestPlatform) {
  const missing = [
    'REDIS_URL',
    `APIFY_${platform.toUpperCase()}_ACTOR_ID`,
    'GEMINI_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((name): name is string => Boolean(name && !process.env[name]?.trim()))

  if (!resolveApifyToken()) {
    missing.unshift('APIFY_TOKEN or APIFY_API_TOKEN')
  }

  if (!process.env.SUPABASE_URL?.trim() && !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
  }

  return missing
}

function missingBaseEnvForIngest() {
  const missing = ['REDIS_URL', 'GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
    .filter((name) => !process.env[name]?.trim())

  if (!process.env.SUPABASE_URL?.trim() && !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
  }

  return missing
}

async function enqueueIngestJob(input: {
  channelId: string
  platform: IngestPlatform
  actorId: string
  input: Record<string, unknown>
  mode?: RbhqIngestMode
  sourceIds?: string[]
  sourceCount?: number
}) {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['scripts/enqueue-rbhq-ingest-job.mjs', JSON.stringify(input)],
    { cwd: process.cwd(), timeout: 10_000 },
  )
  const result = JSON.parse(stdout) as { jobId: string }
  return result.jobId
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!validateCsrfRequest(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token.' }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      platform?: string
      mode?: string
      sourceIds?: unknown
      channelIds?: unknown
      limit?: unknown
    }
    const platform: IngestPlatform =
      body.platform === 'tiktok' || body.platform === 'reddit' || body.platform === 'instagram'
        ? body.platform
        : 'youtube'
    const explicitMode =
      body.mode === 'native' ||
      body.mode === 'curated' ||
      body.mode === 'discovery' ||
      body.mode === 'apify'
        ? body.mode
        : null
    const sourceIds = Array.isArray(body.sourceIds)
      ? body.sourceIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : []
    const channelIds = Array.isArray(body.channelIds)
      ? body.channelIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : []
    if (channelIds.some((channelId) => !session.channelIds.includes(channelId))) {
      return NextResponse.json({ error: 'Channel not found.' }, { status: 404 })
    }
    const limit = typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? Math.min(100, Math.max(1, Math.trunc(body.limit)))
      : 30

    const mode: RbhqIngestMode = explicitMode ?? 'native'
    const usesApify = mode === 'apify' || mode === 'discovery'
    const missingEnv = usesApify ? missingEnvForIngest(platform) : missingBaseEnvForIngest()
    if (missingEnv.length > 0) {
      return NextResponse.json(
        { error: `Missing ingest env: ${missingEnv.join(', ')}.` },
        { status: 500 },
      )
    }

    if (mode === 'native' || mode === 'curated') {
      const sources = await listCuratedSources({
        platform: body.platform,
        sourceIds,
        channelIds,
        limit,
      })
      if (sources.length === 0) {
        return NextResponse.json({ error: 'No curated sources were available for native ingest.' }, { status: 400 })
      }

      const groupedSources = new Map<string, typeof sources>()
      for (const source of sources) {
        const channelSources = groupedSources.get(source.channel_id) ?? []
        channelSources.push(source)
        groupedSources.set(source.channel_id, channelSources)
      }
      const enqueued = await Promise.all(
        [...groupedSources.entries()].map(async ([channelId, channelSources]) => ({
          channelId,
          platform: 'youtube' as const,
          jobId: await enqueueIngestJob({
            channelId,
            platform: 'youtube',
            actorId: 'native',
            input: { sourceIds: channelSources.map((source) => source.id), limit },
            mode: 'native',
            sourceIds: channelSources.map((source) => source.id),
            sourceCount: channelSources.length,
          }),
          sourceCount: channelSources.length,
        })),
      )

      return NextResponse.json({
        ok: true,
        mode: 'native',
        sources: sources.length,
        jobs: enqueued,
      })
    }

    if (mode === 'apify') {
      const sources = await listCuratedSources({
        platform: body.platform,
        sourceIds,
        channelIds,
        limit,
      })
      const jobs = buildCuratedSourceJobs(sources)
      if (jobs.length === 0) {
        return NextResponse.json(
          {
            error: 'No curated sources with configured actors were available for ingest.',
            sources: sources.length,
          },
          { status: 400 },
        )
      }

      const enqueued = await Promise.all(
        jobs.map(async (job) => ({
          channelId: job.channelId,
          platform: job.platform,
          jobId: await enqueueIngestJob({
            channelId: job.channelId,
            platform: job.platform,
            actorId: job.actorId,
            input: job.input,
            mode: 'apify',
            sourceIds: job.sourceIds,
            sourceCount: job.sourceCount,
          }),
          sourceCount: job.sourceCount,
        })),
      )

      return NextResponse.json({
        ok: true,
        mode: 'apify',
        sources: sources.length,
        jobs: enqueued,
      })
    }

    const actorId = ACTORS[platform] || ''
    if (!actorId) {
      return NextResponse.json(
        { error: `Missing APIFY_${platform.toUpperCase()}_ACTOR_ID.` },
        { status: 400 },
      )
    }

    if (channelIds.length !== 1) {
      return NextResponse.json(
        { error: 'Discovery ingest requires exactly one target channel.' },
        { status: 400 },
      )
    }

    const jobId = await enqueueIngestJob({
      channelId: channelIds[0],
      platform,
      actorId,
      input: SOURCE_INPUTS[platform],
      mode,
    })

    return NextResponse.json({ ok: true, jobId, platform, mode })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start ingest.'
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 })
  }
}
