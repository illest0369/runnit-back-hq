import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

const execFileAsync = promisify(execFile)
const SPORTS_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000001'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(supabaseUrl, serviceKey)
}

function readFixture() {
  const fixturePath = path.join(process.cwd(), 'docs/fixtures/timed-transcript.sample.json')
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Array<{
    start: number
    duration: number
    end: number
    text: string
  }>
}

async function main() {
  const supabase = createSupabase()
  const smokeId = randomUUID()
  const channelKey = `smoke-transcript-${smokeId}`
  const now = new Date().toISOString()
  const inserted = {
    sourceId: null as string | null,
    videoId: null as string | null,
    transcriptId: null as string | null,
    candidateIds: [] as string[],
  }

  try {
    const transcriptSegments = readFixture()
    assert(transcriptSegments.length > 0, 'Timed transcript fixture is empty.')

    const sourceResult = await supabase
      .from('source_channels')
      .insert({
        channel_key: channelKey,
        display_name: 'Smoke Transcript Scout',
        platform: 'youtube',
        source_url: 'https://www.youtube.com/channel/UC_RBHQ_TRANSCRIPT_SMOKE',
        rss_url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_RBHQ_TRANSCRIPT_SMOKE',
        target_rbhq_channel_id: SPORTS_CHANNEL_ID,
        enabled: true,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()
    if (sourceResult.error) throw new Error(sourceResult.error.message)
    inserted.sourceId = (sourceResult.data as { id: string }).id

    const videoResult = await supabase
      .from('ingested_videos')
      .insert({
        source_channel_id: inserted.sourceId,
        external_video_id: `TRANSCRIPT-${smokeId}`,
        platform: 'youtube',
        title: 'Rookie answers pressure with a clutch comeback finish',
        description: 'Fixture video for timed TikTok transcript scout smoke test.',
        video_url: `https://www.youtube.com/watch?v=TRANSCRIPT${smokeId.slice(0, 6)}`,
        thumbnail_url: 'https://i.ytimg.com/vi/TRANSCRIPT/hqdefault.jpg',
        published_at: now,
        ingest_status: 'transcript_available',
        raw_feed_entry: { fixture: true, smokeId },
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()
    if (videoResult.error) throw new Error(videoResult.error.message)
    inserted.videoId = (videoResult.data as { id: string }).id

    const transcriptResult = await supabase
      .from('video_transcripts')
      .insert({
        ingested_video_id: inserted.videoId,
        transcript_source: 'fixture-timed-transcript',
        transcript_text: transcriptSegments.map((segment) => segment.text).join(' '),
        transcript_json: transcriptSegments,
        language: 'en',
        created_at: now,
      })
      .select('id')
      .single()
    if (transcriptResult.error) throw new Error(transcriptResult.error.message)
    inserted.transcriptId = (transcriptResult.data as { id: string }).id

    const { stdout } = await execFileAsync(
      './node_modules/.bin/tsx',
      ['scripts/scout-video.ts', '--video-id', inserted.videoId],
      { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
    )
    const scout = JSON.parse(stdout) as {
      result: string
      candidates?: Array<{
        id: string
        status: string
        score: number
        start_seconds: number | null
        end_seconds: number | null
        score_breakdown?: { durationSeconds?: number; platform?: string; timedTranscriptAvailable?: boolean }
      }>
    }
    assert(scout.result === 'PASS', 'Scout script did not pass.')
    const candidates = scout.candidates ?? []
    inserted.candidateIds = candidates.map((candidate) => candidate.id)
    assert(candidates.length > 0, 'Scout did not create transcript-backed candidates.')

    const timedCandidates = candidates.filter((candidate) => candidate.start_seconds !== null && candidate.end_seconds !== null)
    assert(timedCandidates.length > 0, 'No candidate had timed start/end seconds.')
    for (const candidate of timedCandidates) {
      const duration = Number(candidate.end_seconds) - Number(candidate.start_seconds)
      assert(duration >= 15 && duration <= 60, `Candidate duration ${duration} is outside TikTok target range.`)
      assert(candidate.status === 'candidate', 'Candidate status was not candidate.')
      assert(candidate.score_breakdown?.platform === 'tiktok', 'Candidate was not marked as TikTok scout output.')
      assert(candidate.score_breakdown?.timedTranscriptAvailable === true, 'Candidate did not record timed transcript availability.')
    }

    console.log(JSON.stringify(
      {
        result: 'PASS',
        transcript: {
          source: 'fixture-timed-transcript',
          segments: transcriptSegments.length,
        },
        scout: {
          candidates: candidates.length,
          timedCandidates: timedCandidates.length,
          firstCandidate: timedCandidates[0],
        },
        safety: {
          n8nRequired: false,
          livePublishStateSet: false,
          manualApprovalStillRequired: true,
        },
      },
      null,
      2,
    ))
  } catch (error) {
    console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
    process.exitCode = 1
  } finally {
    if (inserted.candidateIds.length > 0) {
      await supabase.from('clip_candidates').delete().in('id', inserted.candidateIds)
    }
    if (inserted.transcriptId) {
      await supabase.from('video_transcripts').delete().eq('id', inserted.transcriptId)
    }
    if (inserted.videoId) {
      await supabase.from('ingested_videos').delete().eq('id', inserted.videoId)
    }
    if (inserted.sourceId) {
      await supabase.from('source_channels').delete().eq('id', inserted.sourceId)
    }
  }
}

void main()
