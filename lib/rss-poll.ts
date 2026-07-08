import { randomUUID } from 'node:crypto'

import { buildRBHQIntelligenceV1 } from './intelligence-v1'
import { supabaseAdmin } from './supabase'
import { fetchYouTubeRss } from './youtube-rss'

const MAX_CHANNELS_PER_RUN = 20
const MAX_VIDEOS_PER_CHANNEL = 15

type SourceChannelRow = {
  id: string
  channel_key: string
  display_name: string
  rss_url: string
  target_rbhq_channel_id: string | null
}

type IngestedVideoRow = {
  id: string
  title: string
  description: string | null
  published_at: string | null
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
  const { data, error } = await supabaseAdmin
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
    const channelResult = await pollOneChannel(channel)
    result.videos_ingested += channelResult.ingested
    result.candidates_created += channelResult.candidates
    result.channel_results.push(channelResult)
  }

  return result
}

async function pollOneChannel(channel: SourceChannelRow): Promise<PollChannelResult> {
  try {
    const entries = await fetchYouTubeRss(channel.rss_url)
    const limited = entries.slice(0, MAX_VIDEOS_PER_CHANNEL)

    if (limited.length === 0) {
      return { channel_key: channel.channel_key, ingested: 0, candidates: 0, error: null }
    }

    const existingIds = await getExistingVideoIds(limited.map((e) => e.externalVideoId))
    const newEntries = limited.filter((e) => !existingIds.has(e.externalVideoId))

    if (newEntries.length === 0) {
      return { channel_key: channel.channel_key, ingested: 0, candidates: 0, error: null }
    }

    const now = new Date().toISOString()
    const videoRows = newEntries.map((entry) => ({
      id: randomUUID(),
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

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('ingested_videos')
      .insert(videoRows)
      .select('id, title, description, published_at')

    if (insertError) throw new Error(insertError.message)

    const newVideos = (inserted ?? []) as IngestedVideoRow[]
    if (newVideos.length === 0) {
      return { channel_key: channel.channel_key, ingested: 0, candidates: 0, error: null }
    }

    const candidateRows = newVideos.map((video) => {
      const intel = buildRBHQIntelligenceV1({
        title: video.title,
        description: video.description,
        source_name: channel.display_name,
        published_at: video.published_at,
      })
      return {
        id: randomUUID(),
        ingested_video_id: video.id,
        target_channel_id: channel.target_rbhq_channel_id,
        title: video.title,
        summary: intel.operatorSummary,
        hook_text: intel.hook,
        caption: intel.suggestedCaption,
        hashtags: intel.suggestedHashtags,
        score: intel.score,
        score_breakdown: {
          rankLabel: intel.rankLabel,
          urgency: intel.urgency,
          reasons: intel.reasons,
          whyNow: intel.whyNow,
        },
        status: 'candidate',
        created_at: now,
        updated_at: now,
      }
    })

    const { error: candidateError } = await supabaseAdmin
      .from('clip_candidates')
      .insert(candidateRows)

    if (candidateError) throw new Error(candidateError.message)

    const videoIds = newVideos.map((v) => v.id)
    await supabaseAdmin
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

async function getExistingVideoIds(externalIds: string[]): Promise<Set<string>> {
  if (externalIds.length === 0) return new Set()

  const { data, error } = await supabaseAdmin
    .from('ingested_videos')
    .select('external_video_id')
    .eq('platform', 'youtube')
    .in('external_video_id', externalIds)

  if (error) throw new Error(error.message)

  return new Set(
    (data ?? []).map((row: { external_video_id: string }) => row.external_video_id),
  )
}
