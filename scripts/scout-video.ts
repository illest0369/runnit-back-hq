import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import {
  buildTikTokClipCandidates,
  type ScoutTranscriptRow,
  type ScoutVideoRow,
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
    .select('id, title, description, video_url, thumbnail_url, published_at, source_channel_id')
    .eq('id', videoId)
    .single()

  if (videoError || !video) {
    throw new Error(videoError?.message || 'Ingested video not found.')
  }

  const { data: transcript, error: transcriptError } = await supabase
    .from('video_transcripts')
    .select('transcript_source, transcript_text, transcript_json, language')
    .eq('ingested_video_id', videoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (transcriptError) {
    throw new Error(transcriptError.message)
  }

  const candidates = buildTikTokClipCandidates(
    video as ScoutVideoRow,
    transcript as ScoutTranscriptRow | null,
  )

  const { data: inserted, error: insertError } = await supabase
    .from('clip_candidates')
    .insert(candidates)
    .select('id, ingested_video_id, status, score, start_seconds, end_seconds, score_breakdown')

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
