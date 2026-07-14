import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import {
  buildTikTokClipCandidates,
  type ScoutTranscriptRow,
  type ScoutVideoRow,
  TIKTOK_MOMENT_RECOMMENDATION_MODEL,
} from '../lib/tiktok-clip-scout'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value?.trim() || null
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(supabaseUrl, serviceKey)
}

async function main() {
  const videoId = readArg('--video-id') ?? process.env.INGESTED_VIDEO_ID?.trim()
  if (!videoId) {
    throw new Error('Missing video id. Use --video-id <ingested_video_id>.')
  }

  const supabase = createSupabase()
  const { data: video, error: videoError } = await supabase
    .from('ingested_videos')
    .select('id, title, description, video_url, thumbnail_url, published_at, source_channel_id, source_channels(target_rbhq_channel_id)')
    .eq('id', videoId)
    .single()

  if (videoError || !video) {
    throw new Error(videoError?.message || 'Ingested video not found.')
  }

  const { data: transcript, error: transcriptError } = await supabase
    .from('video_transcripts')
    .select('id, transcript_source, transcript_text, transcript_json, language')
    .eq('ingested_video_id', videoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (transcriptError) {
    throw new Error(transcriptError.message)
  }

  const typedVideo = video as ScoutVideoRow & { source_channels?: { target_rbhq_channel_id?: string | null } | Array<{ target_rbhq_channel_id?: string | null }> | null }
  const source = Array.isArray(typedVideo.source_channels) ? typedVideo.source_channels[0] : typedVideo.source_channels
  const targetChannelId = source?.target_rbhq_channel_id ?? null
  const typedTranscript = transcript as ScoutTranscriptRow | null
  const candidates = buildTikTokClipCandidates(typedVideo, typedTranscript, { targetChannelId })

  const { data: existing, error: existingError } = await supabase
    .from('clip_candidates')
    .select('id, ingested_video_id, status, score, start_seconds, end_seconds, score_breakdown')
    .eq('ingested_video_id', videoId)

  if (existingError) {
    throw new Error(existingError.message)
  }

  const existingRecommendations = (existing ?? []).filter((candidate) => {
    const breakdown = candidate.score_breakdown as Record<string, unknown> | null
    return breakdown?.model === TIKTOK_MOMENT_RECOMMENDATION_MODEL &&
      (!typedTranscript?.id || breakdown.transcriptId === typedTranscript.id)
  })

  if (existingRecommendations.length > 0) {
    console.log(JSON.stringify(
      {
        result: 'PASS',
        platform: 'tiktok',
        reused: true,
        transcript: {
          available: Boolean(transcript),
          timed: existingRecommendations.some((candidate) => candidate.start_seconds !== null && candidate.end_seconds !== null),
          source: transcript?.transcript_source ?? null,
          id: typedTranscript?.id ?? null,
        },
        candidates: existingRecommendations,
      },
      null,
      2,
    ))
    return
  }

  const { data: inserted, error: insertError } = candidates.length > 0
    ? await supabase
      .from('clip_candidates')
      .insert(candidates)
      .select('id, ingested_video_id, status, score, start_seconds, end_seconds, score_breakdown')
    : { data: [], error: null }

  if (insertError) {
    throw new Error(insertError.message)
  }

  console.log(JSON.stringify(
    {
      result: 'PASS',
      platform: 'tiktok',
      transcript: {
        available: Boolean(transcript),
        timed: candidates.some((candidate) => candidate.start_seconds !== null && candidate.end_seconds !== null),
        source: transcript?.transcript_source ?? null,
        id: typedTranscript?.id ?? null,
      },
      candidates: inserted,
    },
    null,
    2,
  ))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
