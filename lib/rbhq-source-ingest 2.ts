import { supabaseAdminClient } from './supabase-admin'
import { balanceSourceOrder, findSourceProfile, scoreSourceProfile } from './source-system'

export type RbhqSourcePlatform = 'youtube' | 'tiktok' | 'instagram' | 'reddit' | 'direct'
export type RbhqIngestMode = 'native' | 'curated' | 'discovery' | 'apify'

export type CuratedSourceRow = {
  id: string
  channel_id: string
  url: string | null
  channel_name: string | null
  channel_url: string | null
  platform: string | null
  category: string | null
  priority: string | null
  priority_weight: number | string | null
  ingest_limit: number | string | null
  videos_enqueued: number | string | null
  source_system_score?: number
  source_system_tier?: string | null
  source_system_priority_score?: number | null
  source_system_frequency?: string | null
}

export type CuratedSourceJob = {
  platform: Exclude<RbhqSourcePlatform, 'direct'>
  actorId: string
  sourceIds: string[]
  sourceCount: number
  input: Record<string, unknown>
}

const SUPPORTED_PLATFORMS = new Set(['youtube', 'tiktok', 'instagram', 'reddit', 'direct'])

function toNumber(value: number | string | null | undefined, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return fallback
}

function normalizePlatform(value: string | null | undefined): RbhqSourcePlatform | null {
  const platform = value?.trim().toLowerCase()
  return platform && SUPPORTED_PLATFORMS.has(platform) ? (platform as RbhqSourcePlatform) : null
}

function readSourceUrl(source: CuratedSourceRow) {
  return source.channel_url?.trim() || source.url?.trim() || ''
}

function enrichSource(source: CuratedSourceRow): CuratedSourceRow {
  const profile = findSourceProfile({
    channelId: source.channel_id,
    sourceName: source.channel_name,
    sourceUrl: readSourceUrl(source),
    platform: source.platform,
    category: source.category,
  })

  return {
    ...source,
    source_system_score: scoreSourceProfile(profile, toNumber(source.priority_weight, 1)),
    source_system_tier: profile?.tier ?? null,
    source_system_priority_score: profile?.priority_score ?? null,
    source_system_frequency: profile?.recommended_ingest_frequency ?? null,
  }
}

export function getCuratedSourceUrl(source: CuratedSourceRow) {
  return readSourceUrl(source)
}

function inferPlatformFromUrl(url: string): Exclude<RbhqSourcePlatform, 'direct'> | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'youtube'
    if (hostname.includes('tiktok')) return 'tiktok'
    if (hostname.includes('instagram')) return 'instagram'
    if (hostname.includes('reddit')) return 'reddit'
  } catch {
    return null
  }

  return null
}

function actorForPlatform(platform: Exclude<RbhqSourcePlatform, 'direct'>) {
  if (platform === 'instagram') return process.env.APIFY_INSTAGRAM_ACTOR_ID?.trim() || ''
  return process.env[`APIFY_${platform.toUpperCase()}_ACTOR_ID`]?.trim() || ''
}

function youtubeShortsVariant(url: string) {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/$/, '')
    if (!path || path.endsWith('/shorts') || path.includes('/watch')) return null
    if (path.includes('/@') || path.includes('/channel/')) {
      parsed.pathname = `${path}/shorts`
      return parsed.toString()
    }
  } catch {
    return null
  }

  return null
}

function uniqueStartUrls(urls: string[]) {
  return [...new Set(urls.filter(Boolean))].map((url) => ({ url }))
}

function buildActorInput(platform: Exclude<RbhqSourcePlatform, 'direct'>, sources: CuratedSourceRow[]) {
  const ingestLimit = Math.max(
    1,
    Math.min(50, Math.max(...sources.map((source) => toNumber(source.ingest_limit, 10)), 10)),
  )
  const urls = sources.flatMap((source) => {
    const url = readSourceUrl(source)
    if (!url) return []
    if (platform === 'youtube') return [url, youtubeShortsVariant(url)].filter((value): value is string => Boolean(value))
    return [url]
  })

  return {
    startUrls: uniqueStartUrls(urls),
    maxItems: ingestLimit,
    maxResults: ingestLimit,
    mode: 'profile',
    sourceMode: 'curated',
  }
}

export async function listCuratedSources(input: {
  platform?: string | null
  sourceIds?: string[]
  channelIds?: string[]
  limit?: number
} = {}) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 30))
  let query = supabaseAdminClient
    .from('sources')
    .select(
      'id, channel_id, url, channel_name, channel_url, platform, category, priority, priority_weight, ingest_limit, videos_enqueued',
    )
    .eq('active', true)
    .order('priority_weight', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  const platform = normalizePlatform(input.platform)
  if (platform) {
    query = query.eq('platform', platform)
  }

  if (input.sourceIds?.length) {
    query = query.in('id', input.sourceIds)
  }

  if (input.channelIds?.length) {
    query = query.in('channel_id', input.channelIds)
  }

  let { data, error } = await query
  if (error?.message.includes('does not exist')) {
    let fallbackQuery = supabaseAdminClient
      .from('sources')
      .select('id, channel_id, url, platform, category, active, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (platform) {
      fallbackQuery = fallbackQuery.eq('platform', platform)
    }

    if (input.sourceIds?.length) {
      fallbackQuery = fallbackQuery.in('id', input.sourceIds)
    }

    if (input.channelIds?.length) {
      fallbackQuery = fallbackQuery.in('channel_id', input.channelIds)
    }

    const fallback = await fallbackQuery
    data = fallback.data as unknown as CuratedSourceRow[] | null
    error = fallback.error
  }

  if (error) {
    throw new Error(error.message)
  }

  return balanceSourceOrder(((data ?? []) as CuratedSourceRow[])
    .filter((source) => Boolean(readSourceUrl(source)))
    .map(enrichSource)
    .sort((left, right) =>
      toNumber(right.source_system_score, 0) - toNumber(left.source_system_score, 0) ||
      toNumber(right.priority_weight, 0) - toNumber(left.priority_weight, 0),
    ))
}

export function buildCuratedSourceJobs(sources: CuratedSourceRow[]): CuratedSourceJob[] {
  const byPlatformAndChannel = new Map<string, { platform: Exclude<RbhqSourcePlatform, 'direct'>; sources: CuratedSourceRow[] }>()

  for (const source of sources) {
    const platform = normalizePlatform(source.platform)
    const url = readSourceUrl(source)
    const resolvedPlatform = platform === 'direct' ? inferPlatformFromUrl(url) : platform
    if (!resolvedPlatform) continue

    const key = `${resolvedPlatform}\u0000${source.channel_id}`
    const current = byPlatformAndChannel.get(key) ?? { platform: resolvedPlatform, sources: [] }
    current.sources.push(source)
    byPlatformAndChannel.set(key, current)
  }

  return [...byPlatformAndChannel.values()]
    .map(({ platform, sources: platformSources }) => ({
      platform,
      actorId: actorForPlatform(platform),
      sourceIds: platformSources.map((source) => source.id),
      sourceCount: platformSources.length,
      input: buildActorInput(platform, platformSources),
    }))
    .filter((job) => job.actorId && (job.input.startUrls as unknown[]).length > 0)
}

export async function markSourcesIngestStarted(sourceIds: string[]) {
  if (sourceIds.length === 0) return

  const { error } = await supabaseAdminClient
    .from('sources')
    .update({ last_run_at: new Date().toISOString() })
    .in('id', sourceIds)

  if (error) {
    if (error.message.includes('does not exist')) return
    throw new Error(error.message)
  }
}

export async function markSourcesIngestStartedBestEffort(sourceIds: string[]) {
  try {
    await markSourcesIngestStarted(sourceIds)
  } catch (error) {
    console.warn('[rbhq-native-ingest] source start health update skipped', error instanceof Error ? error.message : error)
  }
}

export async function updateSourcesIngestHealth(input: {
  sourceIds: string[]
  fetched: number
  imported: number
  success: boolean
}) {
  if (input.sourceIds.length === 0) return

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdminClient
    .from('sources')
    .select('id, videos_enqueued')
    .in('id', input.sourceIds)

  if (error) {
    if (error.message.includes('does not exist')) return
    throw new Error(error.message)
  }

  const successRate =
    input.fetched > 0 ? Number((input.imported / input.fetched).toFixed(4)) : input.success ? 1 : 0

  for (const source of (data ?? []) as Array<{ id: string; videos_enqueued: number | string | null }>) {
    const patch: Record<string, unknown> = {
      last_run_at: now,
      videos_enqueued: toNumber(source.videos_enqueued) + input.imported,
      success_rate: successRate,
    }
    if (input.success) {
      patch.last_ingested_at = now
    }

    const { error: updateError } = await supabaseAdminClient
      .from('sources')
      .update(patch)
      .eq('id', source.id)

    if (updateError) {
      if (updateError.message.includes('does not exist')) return
      throw new Error(updateError.message)
    }
  }
}

export async function updateSourcesIngestHealthBestEffort(input: {
  sourceIds: string[]
  fetched: number
  imported: number
  success: boolean
}) {
  try {
    await updateSourcesIngestHealth(input)
  } catch (error) {
    console.warn('[rbhq-native-ingest] source health update skipped', error instanceof Error ? error.message : error)
  }
}
