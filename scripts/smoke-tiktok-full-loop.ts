import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { getN8nConfigReport } from '../lib/n8n-publisher'

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
  const outputPath = path.join(fixtureDir, `full-loop-source-${smokeId}.mp4`)
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
      'sine=frequency=740:sample_rate=44100',
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

async function runTsx(script: string, args: string[] = []): Promise<Record<string, unknown>> {
  const run = await execFileAsync(
    './node_modules/.bin/tsx',
    [script, ...args],
    { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 4 },
  )
  return JSON.parse(run.stdout) as Record<string, unknown>
}

function readObject(value: unknown): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected object.')
  return value as Record<string, unknown>
}

async function main() {
  const configReport = getN8nConfigReport()
  assert(configReport.provider === 'n8n', 'Full-loop smoke requires PUBLISH_PROVIDER=n8n.')
  assert(configReport.configured, 'Full-loop smoke requires N8N_WEBHOOK_URL.')
  assert(configReport.testMode, 'Full-loop smoke requires N8N_TEST_MODE=true.')

  const supabase = createSupabase()
  const smokeId = randomUUID()
  const channelKey = `smoke-tiktok-full-loop-${smokeId}`
  const now = new Date().toISOString()

  const transcriptSegments = readFixture()
  assert(transcriptSegments.length > 0, 'Timed transcript fixture is empty.')
  const fixtureVideoPath = await createFixtureVideo(smokeId)

  const sourceResult = await supabase
    .from('source_channels')
    .insert({
      channel_key: channelKey,
      display_name: 'Smoke TikTok Full Loop',
      platform: 'youtube',
      source_url: 'https://www.youtube.com/channel/UC_RBHQ_FULL_LOOP_SMOKE',
      rss_url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_RBHQ_FULL_LOOP_SMOKE',
      target_rbhq_channel_id: SPORTS_CHANNEL_ID,
      enabled: true,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()
  if (sourceResult.error) throw new Error(sourceResult.error.message)

  const videoResult = await supabase
    .from('ingested_videos')
    .insert({
      source_channel_id: sourceResult.data.id,
      external_video_id: `FULL-LOOP-${smokeId}`,
      platform: 'youtube',
      title: 'Full loop TikTok fixture with a rendered MP4 handoff',
      description: 'Synthetic full-loop source for RBHQ TikTok n8n dry-run validation.',
      video_url: fixtureVideoPath,
      thumbnail_url: 'https://example.com/rbhq-full-loop.jpg',
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

  const transcriptResult = await supabase
    .from('video_transcripts')
    .insert({
      ingested_video_id: videoResult.data.id,
      transcript_source: 'fixture-timed-transcript',
      transcript_text: transcriptSegments.map((segment) => segment.text).join(' '),
      transcript_json: transcriptSegments,
      language: 'en',
      created_at: now,
    })
    .select('id')
    .single()
  if (transcriptResult.error) throw new Error(transcriptResult.error.message)

  const scout = await runTsx('scripts/scout-video.ts', ['--video-id', videoResult.data.id])
  assert(scout.result === 'PASS', 'Scout script did not pass.')
  const candidates = scout.candidates as Array<{ id: string; start_seconds: number | null; end_seconds: number | null; score_breakdown?: { platform?: string } }> | undefined
  const candidate = (candidates ?? []).find((item) =>
    item.start_seconds !== null &&
    item.end_seconds !== null &&
    item.score_breakdown?.platform === 'tiktok'
  )
  assert(candidate, 'Scout did not produce a transcript-backed TikTok candidate.')

  const promoted = await runTsx('scripts/promote-candidate.ts', ['--candidate-id', candidate.id])
  const promotion = readObject(promoted.promotion)
  const promotedClipId = String(promotion.promotedClipId || '')
  assert(promoted.result === 'PASS' && promotedClipId, 'Promotion script did not pass.')

  const rendered = await runTsx('scripts/render-clip.ts', ['--clip-id', promotedClipId])
  const render = readObject(rendered.render)
  const renderedPath = String(render.outputPath || '')
  assert(rendered.result === 'PASS' && renderedPath, 'Render script did not pass.')
  assert(fs.existsSync(renderedPath), 'Rendered MP4 does not exist.')
  assert(fs.statSync(renderedPath).size > 0, 'Rendered MP4 is empty.')

  const approved = await runTsx('scripts/approve-clip.ts', ['--clip-id', promotedClipId])
  const approval = readObject(approved.approval)
  assert(approved.result === 'PASS', 'Approval script did not pass.')
  assert(approval.status === 'approved', 'Approval did not set approved review status.')
  assert(
    approval.publish_status === 'ready_for_automation' || approval.publish_status === 'ready_for_manual_publish',
    'Approval did not set an n8n-ready safe publish status.',
  )
  assert(Boolean(approval.approved_at), 'Approval timestamp was not set before n8n handoff.')
  assert(approval.manually_published_at === null, 'Approval marked clip manually published.')

  const handoffRun = await runTsx('scripts/handoff-n8n.ts', ['--clip-id', promotedClipId])
  const handoff = readObject(handoffRun.handoff)
  const payload = readObject(handoff.payload)
  const media = readObject(payload.media)
  const timing = readObject(payload.timing)
  const source = readObject(payload.source)
  const finalClip = readObject(handoffRun.finalClip)

  assert(handoffRun.result === 'PASS', 'n8n handoff script did not pass.')
  assert(handoff.responseStatus === 200, 'n8n did not return HTTP 200.')
  assert(handoff.n8nStatus === 'n8n_test_mode', 'n8n handoff did not stay in test mode.')
  assert(handoff.automationStatus === 'automation_queued', 'n8n did not return automation_queued.')
  assert(payload.targetPlatform === 'tiktok', 'n8n payload target platform was not TikTok.')
  assert(payload.testMode === true, 'n8n payload was not test mode.')
  assert(payload.publishAction === 'dry_run', 'n8n payload did not use dry_run publish action.')
  assert(media.path === renderedPath, 'n8n payload did not include rendered MP4 path.')
  assert(timing.startSeconds !== null && timing.endSeconds !== null, 'n8n payload did not include candidate timing.')
  assert(typeof source.videoUrl === 'string' && source.videoUrl.length > 0, 'n8n payload did not include source video reference.')
  assert(finalClip.status === 'approved', 'Final clip did not remain approved.')
  assert(finalClip.publishStatus === 'automation_queued', 'Final clip did not record automation-only handoff status.')
  assert(finalClip.manuallyPublishedAt === null, 'Final clip was marked manually published.')
  assert(!['published', 'metricool_published', 'manually_published'].includes(String(finalClip.publishStatus)), 'Final clip was marked as published.')

  console.log(JSON.stringify(
    {
      result: 'PASS',
      sourceId: sourceResult.data.id,
      ingestedVideoId: videoResult.data.id,
      transcriptId: transcriptResult.data.id,
      candidateId: candidate.id,
      promotedClipId,
      renderedMp4Path: renderedPath,
      approval: {
        status: approval.status,
        publishStatus: approval.publish_status,
        approvedAt: approval.approved_at,
        manuallyPublishedAt: approval.manually_published_at,
      },
      n8n: {
        responseStatus: handoff.responseStatus,
        n8nStatus: handoff.n8nStatus,
        automationStatus: handoff.automationStatus,
        responseBody: handoff.responseBody,
      },
      payload: {
        targetPlatform: payload.targetPlatform,
        publishAction: payload.publishAction,
        testMode: payload.testMode,
        mediaPath: media.path,
        timing,
        sourceVideoUrl: source.videoUrl,
      },
      finalClip,
      safety: {
        manualApprovalGateBeforeN8n: Boolean(approval.approved_at),
        livePublishStateSet: false,
        n8nCloudUsed: false,
      },
    },
    null,
    2,
  ))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
