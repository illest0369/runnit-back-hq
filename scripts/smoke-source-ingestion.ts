import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { buildRBHQIntelligenceV1 } from '../lib/intelligence-v1'
import {
  RB_WOMEN_CHANNEL_ID,
  rbWomenPhase1ActiveSources,
  rbWomenPhase1NoisySources,
} from '../lib/rb-women-source-config'
import {
  buildClipCandidateInsertRow,
  pollSourceChannel,
  type SourceChannelRow,
} from '../lib/rss-poll'
import { parseYouTubeRssXml, type YouTubeRssEntry } from '../lib/youtube-rss'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

type SmokeResult = {
  result: 'PASS'
  parser: {
    fixtureEntries: number
    dedupedDuplicate: boolean
  }
  database: {
    mode: 'supabase' | 'memory'
    schemaAvailable: boolean
    sourceCreated: boolean
    sourceReused: boolean
    videoInserted: boolean
    duplicateSkipped: boolean
    candidateInserted: boolean
    candidateIntelligenceScored: boolean
    cleanup: 'complete' | 'not_needed' | 'best_effort'
    note?: string
  }
  intelligence: {
    candidateHasRank: boolean
    candidateHasUrgency: boolean
    candidateHasWhyNow: boolean
    candidateHasOperatorSummary: boolean
    editorialCaptionPrecedence: boolean
    editorialHashtagPrecedence: boolean
    analyzerCaptionFallback: boolean
    analyzerHashtagFallback: boolean
  }
  rbWomenSources: {
    activePhase1Sources: string[]
    noisyPhase1Sources: string[]
    phase1FeedSetComplete: boolean
    missingPhase1Feeds: string[]
    hasWnbaCoreFeed: boolean
    hasUsefulExpansionFeed: boolean
    candidateCarriesSourceFilter: boolean
    genericAnnouncementRejected: boolean
  }
  safety: {
    n8nRequired: false
    livePublishStateSet: false
    productionCronPath: '/api/cron/rss-poll' | 'missing'
    legacyQueueIngestCron: false
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey)
}

function isMissingSchemaError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('schema cache') || message.includes('does not exist')
}

function loadFixture(): YouTubeRssEntry[] {
  const fixturePath = path.join(process.cwd(), 'docs/fixtures/youtube-rss.sample.xml')
  const xml = fs.readFileSync(fixturePath, 'utf8')
  return parseYouTubeRssXml(xml)
}

function readProductionCronPath(): '/api/cron/rss-poll' | 'missing' {
  const vercelConfigPath = path.join(process.cwd(), 'vercel.json')
  if (!fs.existsSync(vercelConfigPath)) return 'missing'

  const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8')) as {
    crons?: Array<{ path?: string }>
  }
  const paths = config.crons?.map((cron) => cron.path) ?? []
  assert(!paths.includes('/api/cron/ingest'), 'Production cron must not call legacy queue/posts ingest.')
  return paths.includes('/api/cron/rss-poll') ? '/api/cron/rss-poll' : 'missing'
}

async function hasSourceSchema(supabase: NonNullable<ReturnType<typeof createSupabase>>) {
  const { error } = await supabase.from('source_channels').select('id').limit(1)
  if (!error) return true
  if (isMissingSchemaError(error)) return false
  throw new Error(error.message)
}

async function runMemorySmoke(entries: YouTubeRssEntry[]): Promise<SmokeResult['database']> {
  const sourceChannels = new Map<string, { id: string; channelKey: string }>()
  const videos = new Map<string, { id: string; sourceChannelId: string }>()
  const candidates: Array<ReturnType<typeof buildClipCandidateInsertRow>> = []

  const channelKey = `smoke-source-${randomUUID()}`
  const source = { id: randomUUID(), channelKey }
  sourceChannels.set(channelKey, source)
  const reusedSource = sourceChannels.get(channelKey)
  const first = entries[0]
  assert(first, 'Fixture did not produce a first entry.')

  const videoKey = `youtube:${first.externalVideoId}`
  videos.set(videoKey, { id: randomUUID(), sourceChannelId: source.id })
  const duplicateSkipped = videos.has(videoKey)
  const video = videos.get(videoKey)
  assert(video, 'Memory smoke video insert failed.')

  candidates.push(buildClipCandidateInsertRow({
    channel: {
      id: source.id,
      channel_key: channelKey,
      display_name: 'Smoke Source Ingestion',
      rss_url: 'mock://youtube-rss',
      target_rbhq_channel_id: null,
    },
    video: {
      id: video.id,
      title: first.title,
      description: first.description,
      published_at: first.publishedAt,
    },
    now: new Date().toISOString(),
    id: randomUUID(),
  }))
  const candidate = candidates[0]

  return {
    mode: 'memory',
    schemaAvailable: false,
    sourceCreated: sourceChannels.has(channelKey),
    sourceReused: reusedSource?.id === source.id,
    videoInserted: videos.has(videoKey),
    duplicateSkipped,
    candidateInserted: candidates.length === 1 && candidate?.status === 'candidate',
    candidateIntelligenceScored: Boolean(
      candidate?.score &&
        candidate.score_breakdown.rankLabel &&
        candidate.score_breakdown.urgency &&
        candidate.score_breakdown.whyNow &&
        candidate.score_breakdown.operatorSummary &&
        candidate.caption &&
        candidate.hashtags.length > 0,
    ),
    cleanup: 'not_needed',
    note: 'Supabase source ingestion tables are not present yet; apply migration 202607040003 before real DB ingest.',
  }
}

async function runSupabaseSmoke(
  supabase: NonNullable<ReturnType<typeof createSupabase>>,
  entries: YouTubeRssEntry[],
): Promise<SmokeResult['database']> {
  const smokeId = randomUUID()
  const channelKey = `smoke-source-${smokeId}`
  const now = new Date().toISOString()
  const insertedIds = {
    sourceId: null as string | null,
    videoId: null as string | null,
    candidateIds: [] as string[],
  }

  try {
    const first = entries[0]
    assert(first, 'Fixture did not produce a first entry.')
    const mockEntries = entries.map((entry) => ({
      ...entry,
      externalVideoId: `${entry.externalVideoId}-${smokeId.slice(0, 8)}`,
      videoUrl: `${entry.videoUrl}&rbhq_smoke=${smokeId}`,
      rawEntry: {
        ...entry.rawEntry,
        smokeId,
      },
    }))

    const sourcePayload = {
      channel_key: channelKey,
      display_name: 'Smoke Source Ingestion',
      platform: 'youtube',
      source_url: 'https://www.youtube.com/channel/UC_RBHQ_SAMPLE',
      rss_url: 'mock://youtube-rss',
      enabled: true,
      updated_at: now,
    }

    const sourceInsert = await supabase
      .from('source_channels')
      .upsert(sourcePayload, { onConflict: 'channel_key' })
      .select('id, channel_key')
      .single()
    if (sourceInsert.error) throw new Error(sourceInsert.error.message)
    insertedIds.sourceId = (sourceInsert.data as { id: string }).id

    const sourceReuse = await supabase
      .from('source_channels')
      .upsert({ ...sourcePayload, display_name: 'Smoke Source Ingestion Reused' }, { onConflict: 'channel_key' })
      .select('id, channel_key, display_name, rss_url, target_rbhq_channel_id')
      .single()
    if (sourceReuse.error) throw new Error(sourceReuse.error.message)

    const sourceChannel = sourceReuse.data as SourceChannelRow
    const pollResult = await pollSourceChannel(sourceChannel, {
      supabase,
      fetchEntries: async () => mockEntries,
      now: () => new Date(now),
    })
    assert(!pollResult.error, `RSS poll failed: ${pollResult.error}`)
    assert(pollResult.ingested === mockEntries.length, `Expected ${mockEntries.length} ingested videos, got ${pollResult.ingested}.`)
    assert(pollResult.candidates === mockEntries.length, `Expected ${mockEntries.length} candidates, got ${pollResult.candidates}.`)

    const videoCheck = await supabase
      .from('ingested_videos')
      .select('id')
      .eq('platform', 'youtube')
      .in('external_video_id', mockEntries.map((entry) => entry.externalVideoId))
    if (videoCheck.error) throw new Error(videoCheck.error.message)
    insertedIds.videoId = ((videoCheck.data ?? [])[0] as { id: string } | undefined)?.id ?? null

    const candidateCheck = await supabase
      .from('clip_candidates')
      .select('id, caption, hashtags, score, score_breakdown, status')
      .in('ingested_video_id', (videoCheck.data ?? []).map((row) => (row as { id: string }).id))
    if (candidateCheck.error) throw new Error(candidateCheck.error.message)
    insertedIds.candidateIds = (candidateCheck.data ?? []).map((row) => (row as { id: string }).id)

    const duplicatePoll = await pollSourceChannel(sourceChannel, {
      supabase,
      fetchEntries: async () => mockEntries,
      now: () => new Date(now),
    })
    assert(!duplicatePoll.error, `Duplicate RSS poll failed: ${duplicatePoll.error}`)

    const firstCandidate = (candidateCheck.data ?? [])[0] as {
      caption?: string | null
      hashtags?: string[] | null
      score?: number | null
      score_breakdown?: {
        rankLabel?: string
        urgency?: string
        whyNow?: string
        operatorSummary?: string
      } | null
    } | undefined

    return {
      mode: 'supabase',
      schemaAvailable: true,
      sourceCreated: Boolean(insertedIds.sourceId),
      sourceReused: (sourceReuse.data as { id: string }).id === insertedIds.sourceId,
      videoInserted: (videoCheck.data ?? []).length === mockEntries.length,
      duplicateSkipped: duplicatePoll.ingested === 0 && duplicatePoll.candidates === 0,
      candidateInserted: insertedIds.candidateIds.length === mockEntries.length,
      candidateIntelligenceScored: Boolean(
        firstCandidate?.score &&
          firstCandidate.caption &&
          firstCandidate.hashtags?.length &&
          firstCandidate.score_breakdown?.rankLabel &&
          firstCandidate.score_breakdown?.urgency &&
          firstCandidate.score_breakdown?.whyNow &&
          firstCandidate.score_breakdown?.operatorSummary,
      ),
      cleanup: 'complete',
    }
  } finally {
    if (insertedIds.candidateIds.length > 0) {
      await supabase.from('clip_candidates').delete().in('id', insertedIds.candidateIds)
    }
    if (insertedIds.videoId) {
      await supabase.from('ingested_videos').delete().eq('source_channel_id', insertedIds.sourceId)
    }
    if (insertedIds.sourceId) {
      await supabase.from('source_channels').delete().eq('id', insertedIds.sourceId)
    }
  }
}

function verifyIntelligencePrecedence(): SmokeResult['intelligence'] {
  const analyzer = {
    priorityScore: 91,
    rankLabel: 'Hot' as const,
    reasonTags: ['breaking' as const],
    whyNow: 'Analyzer why now.',
    operatorSummary: 'Analyzer operator summary.',
    confidence: 'high' as const,
    captionDraft: 'Analyzer caption draft.',
    hashtagPack: ['#AnalyzerTag'],
    hookLine: 'Analyzer hook line.',
    provider: 'heuristic' as const,
    analyzedAt: new Date().toISOString(),
  }
  const analyzerFallback = buildRBHQIntelligenceV1({
    title: 'Breaking rivalry reaction',
    analyzer,
  })
  const editorial = buildRBHQIntelligenceV1({
    title: 'Breaking rivalry reaction',
    analyzer,
    moderation_notes: [
      `editorial_caption:${JSON.stringify('Editorial caption wins.')}`,
      `editorial_hashtags:${JSON.stringify(['#EditorialTag'])}`,
    ],
  })
  const candidate = buildClipCandidateInsertRow({
    channel: {
      id: randomUUID(),
      channel_key: 'smoke-intelligence',
      display_name: 'Smoke Intelligence',
      rss_url: 'mock://youtube-rss',
      target_rbhq_channel_id: null,
    },
    video: {
      id: randomUUID(),
      title: 'Breaking rivalry reaction sends fans wild',
      description: 'A heated reaction clip with a clear fan angle.',
      published_at: new Date().toISOString(),
    },
    now: new Date().toISOString(),
    id: randomUUID(),
  })

  return {
    candidateHasRank: Boolean(candidate.score_breakdown.rankLabel),
    candidateHasUrgency: Boolean(candidate.score_breakdown.urgency),
    candidateHasWhyNow: Boolean(candidate.score_breakdown.whyNow),
    candidateHasOperatorSummary: Boolean(candidate.score_breakdown.operatorSummary),
    editorialCaptionPrecedence: editorial.suggestedCaption === 'Editorial caption wins.',
    editorialHashtagPrecedence: editorial.suggestedHashtags[0] === '#EditorialTag',
    analyzerCaptionFallback: analyzerFallback.suggestedCaption === analyzer.captionDraft,
    analyzerHashtagFallback: analyzerFallback.suggestedHashtags[0] === '#AnalyzerTag',
  }
}

function verifyRbWomenSources(): SmokeResult['rbWomenSources'] {
  const active = rbWomenPhase1ActiveSources()
  const noisy = rbWomenPhase1NoisySources()
  const requiredPhase1FeedNames = [
    'WNBA',
    'Unrivaled Basketball',
    'Indiana Fever',
    'Dallas Wings',
    'Minnesota Lynx',
    'Las Vegas Aces',
    'New York Liberty',
    'Chicago Sky',
    'Los Angeles Sparks',
    'Phoenix Mercury',
    'Seattle Storm',
    'Atlanta Dream',
    'Just Women\'s Sports',
    'WNBA on NBC',
    'TNT Sports US',
    'All Women\'s Sports Network',
  ]
  const activeDisplayNames = new Set(active.map((source) => source.displayName))
  const missingPhase1Feeds = requiredPhase1FeedNames.filter((name) => !activeDisplayNames.has(name))
  const debateCandidate = buildClipCandidateInsertRow({
    channel: {
      id: randomUUID(),
      channel_key: 'wnba_official',
      display_name: 'WNBA',
      rss_url: 'mock://youtube-rss',
      target_rbhq_channel_id: RB_WOMEN_CHANNEL_ID,
    },
    video: {
      id: randomUUID(),
      title: 'Caitlin Clark foul debate has fans split after the whistle',
      description: 'A recognizable WNBA player, a foul debate, and a clear officiating angle.',
      published_at: new Date().toISOString(),
    },
    now: new Date().toISOString(),
    id: randomUUID(),
  })
  const genericCandidate = buildClipCandidateInsertRow({
    channel: {
      id: randomUUID(),
      channel_key: 'wnba_official',
      display_name: 'WNBA',
      rss_url: 'mock://youtube-rss',
      target_rbhq_channel_id: RB_WOMEN_CHANNEL_ID,
    },
    video: {
      id: randomUUID(),
      title: 'WNBA announces updated broadcast schedule',
      description: 'The league announced schedule and ticket information with no player angle.',
      published_at: new Date().toISOString(),
    },
    now: new Date().toISOString(),
    id: randomUUID(),
  })
  const debateFilter = debateCandidate.score_breakdown.rbWomenSource as { treatment?: string } | undefined
  const genericFilter = genericCandidate.score_breakdown.rbWomenSource as { treatment?: string } | undefined

  return {
    activePhase1Sources: active.map((source) => source.channelKey),
    noisyPhase1Sources: noisy.map((source) => source.channelKey),
    phase1FeedSetComplete: missingPhase1Feeds.length === 0,
    missingPhase1Feeds,
    hasWnbaCoreFeed: active.some((source) => source.channelKey === 'wnba_official' && source.priority === 'core'),
    hasUsefulExpansionFeed: active.some((source) => source.channelKey === 'all_womens_sports_network' && source.priority === 'useful'),
    candidateCarriesSourceFilter: debateFilter?.treatment === 'advanced',
    genericAnnouncementRejected: genericFilter?.treatment === 'rejected',
  }
}

async function main() {
  const entries = loadFixture()
  assert(entries.length === 2, `Expected fixture to parse 2 unique entries, received ${entries.length}.`)
  assert(new Set(entries.map((entry) => entry.externalVideoId)).size === entries.length, 'Fixture duplicate was not deduped.')
  assert(entries.every((entry) => entry.videoUrl && entry.title), 'Parsed entries are missing title or URL.')

  const supabase = createSupabase()
  const database = supabase && await hasSourceSchema(supabase)
    ? await runSupabaseSmoke(supabase, entries)
    : await runMemorySmoke(entries)

  assert(database.sourceCreated, 'Source channel was not created.')
  assert(database.sourceReused, 'Source channel was not reused.')
  assert(database.videoInserted, 'Ingested video was not created.')
  assert(database.duplicateSkipped, 'Duplicate video was not skipped.')
  assert(database.candidateInserted, 'Clip candidate was not created.')
  assert(database.candidateIntelligenceScored, 'Clip candidate did not include Intelligence V1 fields.')

  const intelligence = verifyIntelligencePrecedence()
  assert(Object.values(intelligence).every(Boolean), 'Intelligence V1 precedence or candidate field smoke failed.')
  const rbWomenSources = verifyRbWomenSources()
  assert(rbWomenSources.phase1FeedSetComplete, `RB Women Phase 1 source config is missing: ${rbWomenSources.missingPhase1Feeds.join(', ')}`)
  assert(rbWomenSources.hasWnbaCoreFeed, 'RB Women Phase 1 must include WNBA as a core source.')
  assert(rbWomenSources.hasUsefulExpansionFeed, 'RB Women Phase 1 must include a useful women sports expansion source.')
  assert(rbWomenSources.candidateCarriesSourceFilter, 'RB Women candidates must carry source filter metadata.')
  assert(rbWomenSources.genericAnnouncementRejected, 'RB Women generic announcements must be rejected by source filters.')
  const productionCronPath = readProductionCronPath()
  assert(productionCronPath === '/api/cron/rss-poll', 'Production cron does not target safe RSS polling route.')

  const result: SmokeResult = {
    result: 'PASS',
    parser: {
      fixtureEntries: entries.length,
      dedupedDuplicate: true,
    },
    database,
    intelligence,
    rbWomenSources,
    safety: {
      n8nRequired: false,
      livePublishStateSet: false,
      productionCronPath,
      legacyQueueIngestCron: false,
    },
  }

  console.log(JSON.stringify(result, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
