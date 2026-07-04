import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

type IngestedVideoRow = {
  id: string
  title: string
  description: string | null
  video_url: string
  thumbnail_url: string | null
  published_at: string | null
  source_channel_id: string | null
}

type TranscriptRow = {
  transcript_source: string
  transcript_text: string | null
  transcript_json: unknown
  language: string | null
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

function compact(value: string | null | undefined, maxLength: number): string {
  const clean = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 3).trim()}...`
}

function hashtagsFromTitle(title: string): string[] {
  const normalized = title.toLowerCase()
  const tags = ['RBHQ', 'Sports']
  if (normalized.includes('wnba') || normalized.includes('women')) tags.push('WomensSports')
  if (normalized.includes('college') || normalized.includes('ncaa')) tags.push('CollegeSports')
  if (normalized.includes('football') || normalized.includes('nfl')) tags.push('Football')
  if (normalized.includes('basketball') || normalized.includes('nba')) tags.push('Basketball')
  return [...new Set(tags)].slice(0, 5)
}

function readTimedSegments(transcriptJson: unknown): Array<{ start: number; end: number; text: string }> {
  const rawSegments = Array.isArray(transcriptJson)
    ? transcriptJson
    : transcriptJson && typeof transcriptJson === 'object' && Array.isArray((transcriptJson as { segments?: unknown }).segments)
      ? (transcriptJson as { segments: unknown[] }).segments
      : []

  return rawSegments.flatMap((segment) => {
    if (!segment || typeof segment !== 'object') return []
    const record = segment as Record<string, unknown>
    const start = Number(record.start ?? record.start_seconds)
    const end = Number(record.end ?? record.end_seconds)
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return []
    return [{ start, end, text }]
  })
}

function buildCandidate(video: IngestedVideoRow, transcript: TranscriptRow | null) {
  const segments = transcript ? readTimedSegments(transcript.transcript_json) : []
  const hasTimedTranscript = segments.length > 0
  const transcriptText = transcript?.transcript_text?.trim() || segments.map((segment) => segment.text).join(' ')
  const basis = transcriptText || `${video.title}. ${video.description ?? ''}`
  const summary = compact(basis, hasTimedTranscript ? 220 : 180)
  const hook = compact(hasTimedTranscript ? segments.slice(0, 3).map((segment) => segment.text).join(' ') : video.title, 120)
  const score = hasTimedTranscript ? 62 : transcriptText ? 52 : 38

  return {
    ingested_video_id: video.id,
    target_channel_id: null,
    start_seconds: hasTimedTranscript ? segments[0].start : null,
    end_seconds: hasTimedTranscript ? segments[Math.min(segments.length - 1, 4)].end : null,
    title: compact(video.title, 140) || 'Untitled candidate',
    summary,
    hook_text: hook,
    caption: compact(hook || video.title, 220),
    hashtags: hashtagsFromTitle(video.title),
    score,
    score_breakdown: {
      model: 'rbhq-scout-v1-conservative',
      transcriptAvailable: Boolean(transcript),
      timedTranscriptAvailable: hasTimedTranscript,
      limitations: hasTimedTranscript
        ? ['Heuristic candidate only; human review is still required.']
        : ['No timed transcript available; start_seconds and end_seconds are intentionally null.', 'Candidate is based on title/description only and is not Opus-style moment detection.'],
      signals: {
        title: video.title,
        hasDescription: Boolean(video.description?.trim()),
        transcriptSource: transcript?.transcript_source ?? null,
      },
    },
    status: 'candidate',
    updated_at: new Date().toISOString(),
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

  const candidate = buildCandidate(video as IngestedVideoRow, transcript as TranscriptRow | null)
  const { data: inserted, error: insertError } = await supabase
    .from('clip_candidates')
    .insert(candidate)
    .select('id, ingested_video_id, status, score, start_seconds, end_seconds')
    .single()

  if (insertError) {
    throw new Error(insertError.message)
  }

  console.log(JSON.stringify({ result: 'PASS', candidate: inserted }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
