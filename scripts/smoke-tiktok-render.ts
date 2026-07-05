import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { getClipById } from '../lib/moderation-queue'

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

async function createFixtureVideo(smokeId: string): Promise<string> {
  const fixtureDir = path.join(process.cwd(), 'tmp', 'render-fixtures')
  fs.mkdirSync(fixtureDir, { recursive: true })
  const outputPath = path.join(fixtureDir, `source-${smokeId}.mp4`)
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=1280x720:rate=30',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:sample_rate=44100',
      '-t',
      '20',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      outputPath,
    ],
    { maxBuffer: 1024 * 1024 * 10 },
  )
  return outputPath
}

async function main() {
  const supabase = createSupabase()
  const smokeId = randomUUID()
  const channelKey = `smoke-tiktok-render-${smokeId}`
  const now = new Date().toISOString()
  const inserted = {
    sourceId: null as string | null,
    videoId: null as string | null,
    transcriptId: null as string | null,
    candidateIds: [] as string[],
    promotedClipId: null as string | null,
  }
  let fixtureVideoPath: string | null = null
  let renderedPath: string | null = null

  try {
    const transcriptSegments = readFixture()
    assert(transcriptSegments.length > 0, 'Timed transcript fixture is empty.')
    fixtureVideoPath = await createFixtureVideo(smokeId)

    const sourceResult = await supabase
      .from('source_channels')
      .insert({
        channel_key: channelKey,
        display_name: 'Smoke TikTok Render',
        platform: 'youtube',
        source_url: 'https://www.youtube.com/channel/UC_RBHQ_RENDER_SMOKE',
        rss_url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_RBHQ_RENDER_SMOKE',
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
        external_video_id: `RENDER-${smokeId}`,
        platform: 'youtube',
        title: 'Fixture source video for TikTok MP4 rendering',
        description: 'Synthetic fixture video for rendering a transcript-backed TikTok candidate.',
        video_url: fixtureVideoPath,
        thumbnail_url: 'https://example.com/rbhq-render-fixture.jpg',
        duration_seconds: 20,
        published_at: now,
        ingest_status: 'transcript_available',
        raw_feed_entry: { fixture: true, smokeId, localVideo: fixtureVideoPath },
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

    const scoutRun = await execFileAsync(
      './node_modules/.bin/tsx',
      ['scripts/scout-video.ts', '--video-id', inserted.videoId],
      { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
    )
    const scout = JSON.parse(scoutRun.stdout) as {
      result: string
      candidates?: Array<{ id: string; start_seconds: number | null; end_seconds: number | null; score_breakdown?: { platform?: string } }>
    }
    assert(scout.result === 'PASS', 'Scout script did not pass.')
    const candidate = (scout.candidates ?? []).find((item) =>
      item.start_seconds !== null &&
      item.end_seconds !== null &&
      item.score_breakdown?.platform === 'tiktok'
    )
    assert(candidate, 'Scout did not produce a transcript-backed TikTok candidate.')
    inserted.candidateIds = (scout.candidates ?? []).map((item) => item.id)

    const promoteRun = await execFileAsync(
      './node_modules/.bin/tsx',
      ['scripts/promote-candidate.ts', '--candidate-id', candidate.id],
      { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
    )
    const promoted = JSON.parse(promoteRun.stdout) as {
      result: string
      promotion?: { promotedClipId: string; reviewStatus: string; publishStatus: string }
    }
    assert(promoted.result === 'PASS' && promoted.promotion, 'Promotion script did not pass.')
    inserted.promotedClipId = promoted.promotion.promotedClipId

    const renderRun = await execFileAsync(
      './node_modules/.bin/tsx',
      ['scripts/render-clip.ts', '--clip-id', inserted.promotedClipId],
      { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
    )
    const rendered = JSON.parse(renderRun.stdout) as {
      result: string
      render?: { outputPath: string; durationSeconds: number; sizeBytes: number; clipId: string }
    }
    assert(rendered.result === 'PASS' && rendered.render, 'Render script did not pass.')
    renderedPath = rendered.render.outputPath
    assert(fs.existsSync(renderedPath), 'Rendered MP4 does not exist.')
    assert(fs.statSync(renderedPath).size > 0, 'Rendered MP4 is empty.')
    assert(rendered.render.durationSeconds >= 1 && rendered.render.durationSeconds <= 60, 'Rendered MP4 duration is not TikTok appropriate.')

    const reviewItem = await getClipById(inserted.promotedClipId, { includeMetricoolHandoffStatus: false })
    assert(reviewItem, 'Rendered promoted clip was not found.')
    assert(reviewItem.status === 'pending', 'Rendered review item must remain pending.')
    assert(reviewItem.publish_status === 'not_ready', 'Rendered review item must not be export-ready before approval.')
    assert(reviewItem.approved_at === null, 'Rendered review item must not be approved.')
    assert(reviewItem.manually_published_at === null, 'Rendered review item must not be manually published.')
    assert(reviewItem.video_url === renderedPath, 'Rendered review item did not store local MP4 path.')
    assert(reviewItem.risk_flags.includes('rendered_local_mp4'), 'Rendered review item did not record render flag.')
    assert(!reviewItem.risk_flags.includes('needs_clip_render'), 'Rendered review item still requires clip render.')
    assert(
      reviewItem.moderation_notes.some((note) => note.includes(`rendered_tiktok_mp4:${renderedPath}`)),
      'Rendered review item does not record local MP4 path.',
    )

    console.log(JSON.stringify(
      {
        result: 'PASS',
        candidate: {
          id: candidate.id,
        },
        promotedReviewItem: {
          id: reviewItem.id,
          status: reviewItem.status,
          publishStatus: reviewItem.publish_status,
          approvedAt: reviewItem.approved_at,
          manuallyPublishedAt: reviewItem.manually_published_at,
          videoUrl: reviewItem.video_url,
          riskFlags: reviewItem.risk_flags,
        },
        render: rendered.render,
        safety: {
          manualApprovalRequired: reviewItem.status === 'pending',
          n8nRequired: false,
          livePublishStateSet: false,
          approved: Boolean(reviewItem.approved_at),
        },
      },
      null,
      2,
    ))
  } catch (error) {
    console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
    process.exitCode = 1
  } finally {
    if (inserted.promotedClipId) {
      await supabase.from('clips').delete().eq('id', inserted.promotedClipId)
    }
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
    if (fixtureVideoPath) {
      fs.rmSync(fixtureVideoPath, { force: true })
    }
  }
}

void main()
