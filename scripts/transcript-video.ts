import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { acquireYouTubeTranscript } from '../lib/youtube-transcripts'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

type IngestedVideoRow = {
  id: string
  video_url: string
  title: string
}

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

async function updateIngestStatus(
  supabase: ReturnType<typeof createSupabase>,
  videoId: string,
  ingestStatus: 'transcript_available' | 'transcript_unavailable',
) {
  const { error } = await supabase
    .from('ingested_videos')
    .update({ ingest_status: ingestStatus, updated_at: new Date().toISOString() })
    .eq('id', videoId)

  if (error) {
    console.warn('[transcript] ingest_status update skipped:', error.message)
  }
}

async function main() {
  const videoId = readArg('--video-id') ?? process.env.INGESTED_VIDEO_ID?.trim()
  if (!videoId) {
    throw new Error('Missing video id. Use --video-id <ingested_video_id>.')
  }

  const supabase = createSupabase()
  const { data: video, error: videoError } = await supabase
    .from('ingested_videos')
    .select('id, video_url, title')
    .eq('id', videoId)
    .single()

  if (videoError || !video) {
    throw new Error(videoError?.message || 'Ingested video not found.')
  }

  const typedVideo = video as IngestedVideoRow
  const transcript = await acquireYouTubeTranscript(typedVideo.video_url)
  if (!transcript.ok) {
    await updateIngestStatus(supabase, typedVideo.id, 'transcript_unavailable')
    console.log(JSON.stringify(
      {
        result: 'UNAVAILABLE',
        videoId: typedVideo.id,
        source: transcript.source,
        reason: transcript.reason,
        inserted: false,
        note: 'No timed transcript was stored and no timestamps were inferred.',
      },
      null,
      2,
    ))
    return
  }

  const { data: inserted, error: insertError } = await supabase
    .from('video_transcripts')
    .insert({
      ingested_video_id: typedVideo.id,
      transcript_source: transcript.source,
      transcript_text: transcript.transcriptText,
      transcript_json: transcript.segments,
      language: transcript.language,
    })
    .select('id, ingested_video_id, transcript_source, language, created_at')
    .single()

  if (insertError) {
    throw new Error(insertError.message)
  }

  await updateIngestStatus(supabase, typedVideo.id, 'transcript_available')
  console.log(JSON.stringify(
    {
      result: 'PASS',
      videoId: typedVideo.id,
      transcript: inserted,
      segments: transcript.segments.length,
      transcriptTextLength: transcript.transcriptText.length,
    },
    null,
    2,
  ))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
