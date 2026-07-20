import { randomUUID } from 'node:crypto'

import { buildRBHQIntelligenceV1 } from './intelligence-v1'
import {
  RB_COMBAT_CHANNEL_ID,
  classifyRBCombatSourceCandidate,
  type RBCombatSourceCandidateFilter,
} from './rb-combat-source-config'
import {
  RB_SPORTS_CHANNEL_ID,
  classifyRBSportsSourceCandidate,
  type RBSportsSourceCandidateFilter,
} from './rb-sports-source-config'
import {
  RB_WOMEN_CHANNEL_ID,
  classifyRBWomenSourceCandidate,
  type RBWomenSourceCandidateFilter,
} from './rb-women-source-config'
import { supabaseAdminClient } from './supabase-admin'
import { fetchYouTubeRss, type YouTubeRssEntry } from './youtube-rss'

const MAX_CHANNELS_PER_RUN = 20
const MAX_VIDEOS_PER_CHANNEL = 15

export type SourceChannelRow = {
  id: string
  channel_key: string
  display_name: string
  rss_url: string
  target_rbhq_channel_id: string | null
}

export type IngestedVideoRow = {
  id: string
  title: string
  description: string | null
  published_at: string | null
}

export type ClipCandidateInsertRow = {
  id: string
  ingested_video_id: string
  target_channel_id: string | null
  title: string
  summary: string
  hook_text: string
  caption: string
  hashtags: string[]
  score: number
  score_breakdown: {
    model: 'rbhq_intelligence_v1'
    rankLabel: string
    urgency: string
    reasons: string[]
    whyNow: string
    operatorSummary: string
    rbCombatSource?: RBCombatSourceCandidateFilter
    rbSportsSource?: RBSportsSourceCandidateFilter
    rbWomenSource?: RBWomenSourceCandidateFilter
  }
  status: 'candidate'
  created_at: string
  updated_at: string
}

type PollSourceChannelOptions = {
  supabase?: Pick<typeof supabaseAdminClient, 'from'>
  fetchEntries?: (url: string) => Promise<YouTubeRssEntry[]>
  now?: () => Date
  randomId?: () => string
  maxVideosPerChannel?: number
}

export type PollChannelResult = {
  channel_key: string
  ingested: number
  candidates: number
  error: string | null
}

export type PollResult = {
  channels_polled: number
  videos_ingested: number
  candidates_created: number
  channel_results: PollChannelResult[]
}

export async function pollAllSourceChannels(): Promise<PollResult> {
  const { data, error } = await supabaseAdminClient
    .from('source_channels')
    .select('id, channel_key, display_name, rss_url, target_rbhq_channel_id')
    .eq('enabled', true)
    .limit(MAX_CHANNELS_PER_RUN)

  if (error) throw new Error(error.message)

  const channels = (data ?? []) as SourceChannelRow[]
  const result: PollResult = {
    channels_polled: channels.length,
    videos_ingested: 0,
    candidates_created: 0,
    channel_results: [],
  }

  for (const channel of channels) {
    const channelResult = await pollSourceChannel(channel)
    result.videos_ingested += channelResult.ingested
    result.candidates_created += channelResult.candidates
    result.channel_results.push(channelResult)
  }

  return result
}

export async function pollSourceChannel(
  channel: SourceChannelRow,
  options: PollSourceChannelOptions = {},
): Promise<PollChannelResult> {
  const supabase = options.supabase ?? supabaseAdminClient
  const fetchEntries = options.fetchEntries ?? fetchYouTubeRss
  const maxVideosPerChannel = options.maxVideosPerChannel ?? MAX_VIDEOS_PER_CHANNEL

  try {
    const entries = await fetchEntries(channel.rss_url)
    const limited = entries.slice(0, maxVideosPerChannel)

    if (limited.length === 0) {
      return { channel_key: channel.channel_key, ingested: 0, candidates: 0, error: null }
    }

    const existingIds = await getExistingVideoIds(supabase, limited.map((e) => e.externalVideoId))
    const newEntries = limited.filter((e) => !existingIds.has(e.externalVideoId))

    if (newEntries.length === 0) {
      return { channel_key: channel.channel_key, ingested: 0, candidates: 0, error: null }
    }

    const now = (options.now ?? (() => new Date()))().toISOString()
    const randomId = options.randomId ?? randomUUID
    const videoRows = newEntries.map((entry) => ({
      id: randomId(),
      source_channel_id: channel.id,
      external_video_id: entry.externalVideoId,
      platform: 'youtube',
      title: entry.title,
      description: entry.description,
      video_url: entry.videoUrl,
      thumbnail_url: entry.thumbnailUrl,
      published_at: entry.publishedAt,
      duration_seconds: null,
      ingest_status: 'ingested',
      raw_feed_entry: entry.rawEntry,
      created_at: now,
      updated_at: now,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('ingested_videos')
      .insert(videoRows)
      .select('id, title, description, published_at')

    if (insertError) throw new Error(insertError.message)

    const newVideos = (inserted ?? []) as IngestedVideoRow[]
    if (newVideos.length === 0) {
      return { channel_key: channel.channel_key, ingested: 0, candidates: 0, error: null }
    }

    const candidateRows = newVideos.map((video) => {
      return buildClipCandidateInsertRow({
        channel,
        video,
        now,
        id: randomId(),
      })
    })

    const { error: candidateError } = await supabase
      .from('clip_candidates')
      .insert(candidateRows)

    if (candidateError) throw new Error(candidateError.message)

    const videoIds = newVideos.map((v) => v.id)
    await supabase
      .from('ingested_videos')
      .update({ ingest_status: 'scored', updated_at: now })
      .in('id', videoIds)

    return {
      channel_key: channel.channel_key,
      ingested: newVideos.length,
      candidates: candidateRows.length,
      error: null,
    }
  } catch (err) {
    return {
      channel_key: channel.channel_key,
      ingested: 0,
      candidates: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function buildClipCandidateInsertRow(input: {
  channel: SourceChannelRow
  video: IngestedVideoRow
  now: string
  id: string
}): ClipCandidateInsertRow {
  const intel = buildRBHQIntelligenceV1({
    channel_id: input.channel.target_rbhq_channel_id,
    title: input.video.title,
    description: input.video.description,
    source_name: input.channel.display_name,
    source_type: 'youtube_rss',
    published_at: input.video.published_at,
  })
  const rbWomenSource = input.channel.target_rbhq_channel_id === RB_WOMEN_CHANNEL_ID
    ? classifyRBWomenSourceCandidate({
        channelKey: input.channel.channel_key,
        title: input.video.title,
        description: input.video.description,
        score: intel.score,
      })
    : null
  const rbSportsSource = input.channel.target_rbhq_channel_id === RB_SPORTS_CHANNEL_ID
    ? classifyRBSportsSourceCandidate({
        channelKey: input.channel.channel_key,
        title: input.video.title,
        description: input.video.description,
        score: intel.score,
      })
    : null
  const rbCombatSource = input.channel.target_rbhq_channel_id === RB_COMBAT_CHANNEL_ID
    ? classifyRBCombatSourceCandidate({
        channelKey: input.channel.channel_key,
        title: input.video.title,
        description: input.video.description,
        score: intel.score,
      })
    : null

  return {
    id: input.id,
    ingested_video_id: input.video.id,
    target_channel_id: input.channel.target_rbhq_channel_id,
    title: input.video.title,
    summary: intel.operatorSummary,
    hook_text: intel.hook,
    caption: intel.suggestedCaption,
    hashtags: intel.suggestedHashtags,
    score: intel.score,
    score_breakdown: {
      model: 'rbhq_intelligence_v1',
      rankLabel: intel.rankLabel,
      urgency: intel.urgency,
      reasons: intel.reasons,
      whyNow: intel.whyNow,
      operatorSummary: intel.operatorSummary,
      ...(rbCombatSource ? { rbCombatSource } : {}),
      ...(rbSportsSource ? { rbSportsSource } : {}),
      ...(rbWomenSource ? { rbWomenSource } : {}),
    },
    status: 'candidate',
    created_at: input.now,
    updated_at: input.now,
  }
}

async function getExistingVideoIds(
  supabase: Pick<typeof supabaseAdminClient, 'from'>,
  externalIds: string[],
): Promise<Set<string>> {
  if (externalIds.length === 0) return new Set()

  const { data, error } = await supabase
    .from('ingested_videos')
    .select('external_video_id')
    .eq('platform', 'youtube')
    .in('external_video_id', externalIds)

  if (error) throw new Error(error.message)

  return new Set(
    (data ?? []).map((row: { external_video_id: string }) => row.external_video_id),
  )
}
