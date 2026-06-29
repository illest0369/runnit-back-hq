import { CHANNEL_META, getChannelMeta } from '@/lib/channel-meta'
import {
  getSourceApprovalStats,
  listExistingSourceVideoUrls,
  listSourcesForChannel,
  persistIngestCandidate,
} from '@/lib/clip-db'

const YT_KEY = process.env.YOUTUBE_API_KEY ?? ''
const YT_BASE = 'https://www.googleapis.com/youtube/v3'

interface YTChannelItem {
  id: string
  snippet: { title: string }
  contentDetails: { relatedPlaylists: { uploads: string } }
}

interface YTSearchItem {
  id: { channelId?: string }
}

interface YTVideoItem {
  snippet: {
    title: string
    description: string
    publishedAt: string
    thumbnails: { high?: { url: string }; medium?: { url: string } }
    resourceId: { videoId: string }
  }
}

interface YTVideoDetailsItem {
  id: string
  contentDetails?: { duration?: string }
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
}

type RecentVideo = YTVideoItem['snippet'] & {
  durationSeconds: number | null
  viewCount: number
  engagementCount: number
}

type SourceRow = {
  id: string
  name: string | null
  handle: string | null
  url: string | null
  tier?: string | null
  ingestLimit: number
  cadencePerDay: number
  priorityWeight: number
}

type ResolvedChannel = {
  channelId: string
  uploadsPlaylist: string
  title: string
}

export type ChannelIngestResult = {
  ok: boolean
  channel_id: string
  inserted: number
  skipped: number
  errors: string[]
  titles: string[]
  message: string
  partial: boolean
}

export { CHANNEL_META }

const BOOST_KEYWORDS = [
  'fight',
  'heated',
  'insane',
  'game winner',
  'walk-off',
  'poster',
  'ejected',
  'trash talk',
  'reaction',
  'rage',
  'clutch',
  'ko',
  'tko',
  'knockout',
  'buzzer beater',
  'controversy',
  'staredown',
]

const REJECT_PATTERNS = [
  'full game',
  'full match',
  'highlights compilation',
  'full highlights',
]

const MOMENT_KEYWORDS = [
  'ko',
  'knockout',
  'clutch',
  'winner',
  'buzzer',
  'walk-off',
]

const EMOTION_KEYWORDS = [
  'heated',
  'fight',
  'rage',
  'reaction',
  'ejected',
  'controversy',
]

const CONFLICT_OR_PAYOFF_KEYWORDS = [
  'vs',
  'calls out',
  'responds',
  'confronts',
  'stuns',
  'upsets',
  'wins',
  'loses',
  'dominates',
  'goes off',
  'breaks',
  'last second',
  'overtime',
  'final',
  'reveals',
]

const RECOGNIZABLE_ENTITIES = [
  'nba',
  'nfl',
  'mlb',
  'wnba',
  'nwsl',
  'ufc',
  'pfl',
  'dazn',
  'espn',
  'sec',
  'big ten',
  'playstation',
  'xbox',
  'nintendo',
  'valorant',
  'riot',
  'call of duty',
  'cod',
  'alabama',
  'georgia',
  'michigan',
  'ohio state',
  'texas',
  'usc',
  'lsu',
  'lakers',
  'warriors',
  'celtics',
  'cowboys',
  'chiefs',
  'yankees',
  'dodgers',
]

const MIN_DURATION_SECONDS = 15
const MAX_DURATION_SECONDS = 20 * 60
const MAX_CANDIDATES_PER_CHANNEL = 120

type CandidatePriority = 'priority' | 'main' | 'low'

async function fetchChannelDetails(query: string): Promise<ResolvedChannel | null> {
  const url = `${YT_BASE}/channels?part=contentDetails,snippet&${query}&key=${YT_KEY}`
  const res = await fetch(url)
  if (!res.ok) return null
  const json = await res.json()
  const item: YTChannelItem = json.items?.[0]
  if (!item) return null
  return {
    channelId: item.id,
    uploadsPlaylist: item.contentDetails.relatedPlaylists.uploads,
    title: item.snippet.title,
  }
}

async function resolveHandle(handle: string): Promise<ResolvedChannel | null> {
  const clean = handle.trim().replace(/^@/, '')
  const query =
    clean.startsWith('UC')
      ? `id=${encodeURIComponent(clean)}`
      : `forHandle=${encodeURIComponent(clean)}`
  return fetchChannelDetails(query)
}

async function resolveChannelByName(name: string): Promise<ResolvedChannel | null> {
  const query = name.trim()
  if (!query) return null

  const searchUrl =
    `${YT_BASE}/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(query)}&key=${YT_KEY}`
  const res = await fetch(searchUrl)
  if (!res.ok) return null

  const json = await res.json()
  const item: YTSearchItem = json.items?.[0]
  const channelId = item?.id?.channelId
  if (!channelId) return null

  return fetchChannelDetails(`id=${encodeURIComponent(channelId)}`)
}

function readYouTubeRef(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null

  if (raw.startsWith('@') || raw.startsWith('UC')) {
    return raw
  }

  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    return null
  }

  try {
    const url = new URL(raw)
    const parts = url.pathname.split('/').filter(Boolean)

    const handlePart = parts.find((part) => part.startsWith('@'))
    if (handlePart) {
      return handlePart
    }

    if (parts[0] === 'channel' && parts[1]?.startsWith('UC')) {
      return parts[1]
    }
  } catch {
    return null
  }

  return null
}

function buildSourceCandidates(source: SourceRow): string[] {
  const candidates = [readYouTubeRef(source.url), readYouTubeRef(source.handle)].filter(
    (value): value is string => Boolean(value),
  )

  return [...new Set(candidates)]
}

async function getRecentVideos(
  uploadsPlaylist: string,
  maxResults = 8,
): Promise<RecentVideo[]> {
  const url = `${YT_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylist}&maxResults=${maxResults}&key=${YT_KEY}`
  const res = await fetch(url)
  if (!res.ok) return []
  const json = await res.json()
  const snippets = (json.items ?? []).map((item: YTVideoItem) => item.snippet)
  const videoIds = snippets
    .map((snippet: YTVideoItem['snippet']) => snippet.resourceId.videoId)
    .filter(Boolean)

  if (!videoIds.length) {
    return []
  }

  const detailsUrl = `${YT_BASE}/videos?part=contentDetails,statistics&id=${videoIds.map(encodeURIComponent).join(',')}&key=${YT_KEY}`
  const detailsRes = await fetch(detailsUrl)
  const detailsById = new Map<string, YTVideoDetailsItem>()

  if (detailsRes.ok) {
    const detailsJson = await detailsRes.json()
    for (const item of detailsJson.items ?? []) {
      detailsById.set(item.id, item)
    }
  }

  return snippets.map((snippet: YTVideoItem['snippet']) => {
    const details = detailsById.get(snippet.resourceId.videoId)
    return {
      ...snippet,
      durationSeconds: parseIsoDuration(details?.contentDetails?.duration),
      viewCount: toNumber(details?.statistics?.viewCount),
      engagementCount:
        toNumber(details?.statistics?.likeCount) + toNumber(details?.statistics?.commentCount),
    }
  })
}

function parseIsoDuration(value: string | null | undefined): number | null {
  const match = value?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return null
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  return hours * 3600 + minutes * 60 + seconds
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function keywordMatches(text: string): number {
  const normalized = text.toLowerCase()
  return BOOST_KEYWORDS.reduce(
    (total, keyword) => total + (normalized.includes(keyword) ? 1 : 0),
    0,
  )
}

function containsAny(text: string, patterns: string[]): boolean {
  const normalized = text.toLowerCase()
  return patterns.some((pattern) => normalized.includes(pattern))
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function hasRecognizableEntity(title: string): boolean {
  const normalized = title.toLowerCase()

  if (containsAny(normalized, RECOGNIZABLE_ENTITIES)) {
    return true
  }

  return /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(title)
}

function hasSemiRecognizableEntity(title: string): boolean {
  const normalized = title.toLowerCase()
  return /\b(?:vs\.?|v\.?)\b/.test(normalized) || /#\w{3,}/.test(title) || /@\w{3,}/.test(title)
}

function impliesConflictOrPayoff(title: string): boolean {
  return containsAny(title, CONFLICT_OR_PAYOFF_KEYWORDS)
}

function sourceWeight(source: SourceRow): number {
  const stats = getSourceApprovalStats(source.id)
  let weight = source.priorityWeight || 1

  if (source.tier === 'official-league') weight = Math.max(weight, 1.2)
  if (source.tier === 'viral-native') weight = Math.max(weight, 1.5)
  if (source.tier === 'low-quality') weight = Math.min(weight, 0.6)

  if (stats.reviewed >= 10 && stats.approvalRate > 0.5) weight += 0.2
  if (stats.reviewed >= 10 && stats.approvalRate < 0.2) weight -= 0.2

  return Math.max(0.2, weight)
}

function shouldSkipSource(source: SourceRow): boolean {
  const stats = getSourceApprovalStats(source.id)

  if (stats.reviewed >= 100 && stats.approvalRate < 0.1) {
    return true
  }

  return false
}

function effectiveIngestLimit(source: SourceRow): number {
  const stats = getSourceApprovalStats(source.id)
  let limit = source.ingestLimit || 8

  if (stats.reviewed >= 50 && stats.approvalRate < 0.2) {
    limit = Math.max(2, Math.floor(limit / 2))
  }

  if (stats.reviewed >= 10 && stats.approvalRate > 0.5) {
    limit = Math.ceil(limit * 1.5)
  }

  return limit
}

function scoreVideo(video: RecentVideo, source: SourceRow): number {
  const title = video.title
  let score = 0

  if (containsAny(title, BOOST_KEYWORDS)) score += 15
  if (impliesConflictOrPayoff(title)) score += 10

  if (hasRecognizableEntity(title)) {
    score += 20
  } else if (hasSemiRecognizableEntity(title)) {
    score += 10
  }

  if (containsAny(title, MOMENT_KEYWORDS)) {
    score += 25
  } else {
    score += 10
  }

  if (containsAny(title, EMOTION_KEYWORDS)) score += 20

  score += sourceWeight(source) * 10

  return Math.round(Math.min(100, score))
}

function getPriority(score: number): CandidatePriority {
  if (score >= 85) return 'priority'
  if (score >= 75) return 'main'
  return 'low'
}

function shouldRejectVideo(video: RecentVideo): boolean {
  const title = video.title

  return (
    video.durationSeconds === null ||
    video.durationSeconds < MIN_DURATION_SECONDS ||
    video.durationSeconds > MAX_DURATION_SECONDS ||
    containsAny(title, REJECT_PATTERNS) ||
    (!containsAny(title, BOOST_KEYWORDS) && !hasRecognizableEntity(title)) ||
    wordCount(title) < 4
  )
}

export async function ingestChannel(channelId: string): Promise<ChannelIngestResult> {
  if (!channelId || !getChannelMeta(channelId)) {
    return {
      ok: false,
      channel_id: channelId,
      inserted: 0,
      skipped: 0,
      errors: ['Invalid channel.'],
      titles: [],
      message: 'Invalid channel.',
      partial: false,
    }
  }

  const sources = listSourcesForChannel(channelId).filter((source) =>
    Boolean(source.url?.startsWith('https://')),
  )

  if (!sources.length) {
    return {
      ok: false,
      channel_id: channelId,
      inserted: 0,
      skipped: 0,
      errors: ['No sources are connected for this channel yet.'],
      titles: [],
      message: 'No sources are connected for this channel yet.',
      partial: false,
    }
  }

  const existingUrls = listExistingSourceVideoUrls(channelId)

  const inserted: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  const candidates: Array<{
    source: SourceRow
    resolved: ResolvedChannel
    video: RecentVideo
    score: number
    watchUrl: string
  }> = []

  for (const source of sources as SourceRow[]) {
    if (shouldSkipSource(source)) {
      skipped.push(`${source.name ?? source.url ?? 'Source'} disabled by approval rate`)
      continue
    }

    const sourceRefs = buildSourceCandidates(source)
    let resolved: ResolvedChannel | null = null

    for (const sourceRef of sourceRefs) {
      resolved = await resolveHandle(sourceRef)
      if (resolved) {
        break
      }
    }

    if (!resolved) {
      resolved = await resolveChannelByName(source.name ?? '')
    }

    if (!resolved) {
      errors.push(
        `Could not resolve: ${
          sourceRefs[0] ?? source.handle ?? source.url ?? source.name ?? 'unknown source'
        }`,
      )
      continue
    }

    const videos = await getRecentVideos(resolved.uploadsPlaylist, effectiveIngestLimit(source))

    for (const video of videos) {
      const watchUrl = `https://youtube.com/watch?v=${video.resourceId.videoId}`
      if (existingUrls.has(watchUrl)) {
        skipped.push(video.title)
        continue
      }
      existingUrls.add(watchUrl)

      if (shouldRejectVideo(video)) {
        skipped.push(video.title)
        continue
      }

      const score = scoreVideo(video, source)

      if (score < 65) {
        skipped.push(video.title)
        continue
      }

      candidates.push({ source, resolved, video, score, watchUrl })
    }
  }

  candidates.sort((left, right) => right.score - left.score)

  for (const { source, resolved, video, score, watchUrl } of candidates.slice(
    0,
    MAX_CANDIDATES_PER_CHANNEL,
  )) {
    const thumbnail = video.thumbnails.high?.url ?? video.thumbnails.medium?.url ?? null

    try {
      persistIngestCandidate({
        channelId,
        sourceVideoUrl: watchUrl,
        title: video.title,
        thumbnailUrl: thumbnail,
        sourceName: source.name ?? resolved.title,
        sourceTier: source.tier ?? 'standard',
        score,
        publishedAt: video.publishedAt,
        description: JSON.stringify({
          text: video.description?.slice(0, 500) ?? null,
          priority: getPriority(score),
          duration_seconds: video.durationSeconds,
        }),
      })
    } catch (error) {
      errors.push(
        `sqlite persist failed: ${video.title} — ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      continue
    }

    inserted.push(video.title)
  }

  const partial = errors.length > 0
  const ok = inserted.length > 0 || skipped.length > 0
  const channelLabel = CHANNEL_META[channelId]?.label ?? 'CHANNEL'

  return {
    ok,
    channel_id: channelId,
    inserted: inserted.length,
    skipped: skipped.length,
    errors,
    titles: inserted,
    partial,
    message: ok
      ? `${channelLabel}: added ${inserted.length} new clip${inserted.length === 1 ? '' : 's'}.`
      : 'No videos were ingested.',
  }
}
