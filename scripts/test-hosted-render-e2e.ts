import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { CHANNEL_META } from '../lib/channel-meta'
import {
  copyGeneratedClipToStorage,
  deleteR2Object,
} from '../lib/clip-storage'
import {
  enqueueClipGenerationJob,
  getClipGenerationJobStatus,
  getClipGenerationQueue,
  getQueueConnection,
} from '../lib/queue'
import { saveSourceSuggestion } from '../lib/clip-worker-db'
import { supabaseAdminClient } from '../lib/supabase-admin'

const execFileAsync = promisify(execFile)
const TEST_PREFIX = 'RBHQ Phase 1 hosted render E2E'
const SOURCE_OBJECT_KEY = 'e2e/phase1/20261017/source.mp4'

type Assignment = {
  user_id: string
  channel_id: string
}

type GeneratedPost = {
  id: string
  clip_id: string
  channel_id: string
  source_video_url: string
  video_url: string
  status: string
}

type ProbeResult = {
  streams?: Array<{ width?: number; height?: number }>
  format?: { duration?: string; size?: string }
}

function requireStagingGuards() {
  assert.equal(
    process.env.RBHQ_STAGING_EPHEMERAL_SUPABASE,
    'true',
    'Refusing to run without the isolated staging Supabase marker.',
  )
  assert.ok(process.env.RUNPOD_ENDPOINT_ID?.trim(), 'RUNPOD_ENDPOINT_ID is required.')
  assert.ok(process.env.RUNPOD_API_KEY?.trim(), 'RUNPOD_API_KEY is required.')
  assert.ok(process.env.R2_PUBLIC_BASE_URL?.includes('.r2.dev'), 'Staging R2 public URL is required.')

  const tunnelPort = Number.parseInt(process.env.RBHQ_E2E_REDIS_TUNNEL_PORT ?? '', 10)
  assert.ok(Number.isSafeInteger(tunnelPort) && tunnelPort > 0, 'Redis tunnel port is required.')
  const redisUrl = new URL(process.env.REDIS_URL ?? '')
  redisUrl.hostname = '127.0.0.1'
  redisUrl.port = String(tunnelPort)
  process.env.REDIS_URL = redisUrl.toString()
}

async function selectAssignments(): Promise<[Assignment, Assignment]> {
  const { data, error } = await supabaseAdminClient
    .from('operator_channel_assignments')
    .select('user_id, channel_id')

  if (error) throw new Error(error.message)
  const supported = (data ?? []).filter(
    (row: Assignment) => Boolean(CHANNEL_META[row.channel_id]),
  ) as Assignment[]
  const primary = supported[0]
  const foreign = supported.find((row) => row.channel_id !== primary?.channel_id)
  assert.ok(primary && foreign, 'Two assigned staging channels are required for isolation proof.')
  return [primary, foreign]
}

async function waitForJob(jobId: string) {
  const deadline = Date.now() + 12 * 60_000
  let lastState = ''

  while (Date.now() < deadline) {
    const status = await getClipGenerationJobStatus(jobId)
    assert.ok(status, 'The queued clip job disappeared.')
    const progress = status.progress?.percent ?? null
    if (status.state !== lastState) {
      console.log(JSON.stringify({ event: 'job-state', jobId, state: status.state, progress }))
      lastState = status.state
    }
    if (status.state === 'completed') {
      assert.ok(status.result, 'Completed clip job is missing a result.')
      return status.result
    }
    if (status.state === 'failed') {
      throw new Error(`Hosted clip job failed: ${status.failedReason ?? 'unknown reason'}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000))
  }

  throw new Error('Hosted clip job exceeded the 12-minute E2E timeout.')
}

async function probeVideo(url: string) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=width,height',
    '-show_entries',
    'format=duration,size',
    '-of',
    'json',
    url,
  ])
  const payload = JSON.parse(stdout) as ProbeResult
  const stream = payload.streams?.find((entry) => entry.width && entry.height)
  const durationSeconds = Number(payload.format?.duration ?? 0)
  const sizeBytes = Number(payload.format?.size ?? 0)
  assert.equal(stream?.width, 1080)
  assert.equal(stream?.height, 1920)
  assert.ok(durationSeconds > 0 && durationSeconds <= 60)
  assert.ok(Number.isSafeInteger(sizeBytes) && sizeBytes > 0)
  return { width: stream.width, height: stream.height, durationSeconds, sizeBytes }
}

async function run() {
  requireStagingGuards()
  const fixturePath = process.env.RBHQ_E2E_FIXTURE_PATH?.trim()
  assert.ok(fixturePath, 'RBHQ_E2E_FIXTURE_PATH is required.')

  const cleanup = {
    sourceSuggestion: false,
    databaseRows: false,
    sourceObject: false,
    generatedObjects: false,
    bullJob: false,
  }
  let sourceSuggestionId: string | null = null
  let jobId: string | null = null
  let postIds: string[] = []
  let queueJobIds: string[] = []
  const generatedObjectKeys: string[] = []

  try {
    const sourceUpload = await copyGeneratedClipToStorage(fixturePath, SOURCE_OBJECT_KEY)
    assert.equal(sourceUpload.storageMode, 'r2')
    const [primary, foreign] = await selectAssignments()

    sourceSuggestionId = await saveSourceSuggestion({
      channelId: primary.channel_id,
      operatorId: primary.user_id,
      sourceUrl: sourceUpload.publicUrl,
      title: TEST_PREFIX,
      author: 'RBHQ staging verification',
      durationSeconds: 12.6,
      thumbnailUrl: null,
      initialScore: 95,
      reasoning: ['Isolated staging fixture for Scout to Queue verification.'],
      metadata: { test: true, scope: 'rbhq-phase1-staging' },
    })

    await assert.rejects(
      enqueueClipGenerationJob({
        videoUrl: sourceUpload.publicUrl,
        channelId: foreign.channel_id,
        requestedByUserId: foreign.user_id,
        sourceSuggestionId,
      }),
      /does not belong to the authorized channel/i,
    )

    jobId = await enqueueClipGenerationJob({
      videoUrl: sourceUpload.publicUrl,
      channelId: primary.channel_id,
      requestedByUserId: primary.user_id,
      sourceSuggestionId,
    })
    const result = await waitForJob(jobId)
    assert.ok(result.generatedCount >= 1)
    postIds = result.postIds
    queueJobIds = result.queueJobIds

    const { data: suggestion, error: suggestionError } = await supabaseAdminClient
      .from('source_suggestions')
      .select('id, channel_id, status')
      .eq('id', sourceSuggestionId)
      .single()
    if (suggestionError) throw new Error(suggestionError.message)
    assert.equal(suggestion.channel_id, primary.channel_id)
    assert.equal(suggestion.status, 'ready')

    const { data: posts, error: postsError } = await supabaseAdminClient
      .from('posts')
      .select('id, clip_id, channel_id, source_video_url, video_url, status')
      .in('id', postIds)
    if (postsError) throw new Error(postsError.message)
    const generatedPosts = (posts ?? []) as GeneratedPost[]
    assert.equal(generatedPosts.length, postIds.length)
    for (const post of generatedPosts) {
      assert.equal(post.channel_id, primary.channel_id)
      assert.equal(post.source_video_url, sourceUpload.publicUrl)
      assert.ok(post.status === 'ready_to_post' || post.status === 'approved')
      assert.ok(post.video_url.startsWith(process.env.R2_PUBLIC_BASE_URL ?? ''))
      const objectKey = new URL(post.video_url).pathname.replace(/^\/+/, '')
      generatedObjectKeys.push(objectKey)
    }

    const { data: queuedRows, error: queueError } = await supabaseAdminClient
      .from('queue_jobs')
      .select('id, channel_id, status, clip_url')
      .in('id', queueJobIds)
    if (queueError) throw new Error(queueError.message)
    assert.equal(queuedRows?.length, queueJobIds.length)
    for (const queued of queuedRows ?? []) {
      assert.equal(queued.channel_id, primary.channel_id)
      assert.equal(queued.status, 'ready')
      assert.ok(String(queued.clip_url).startsWith(process.env.R2_PUBLIC_BASE_URL ?? ''))
    }

    const media = await Promise.all(generatedPosts.map((post) => probeVideo(post.video_url)))
    console.log(JSON.stringify({
      status: 'PASS',
      flow: 'Scout→Clip→RunPod Render→Queue',
      crossChannelQueueAttempt: 'DENIED',
      jobId,
      sourceSuggestionId,
      sourceSuggestionStatus: suggestion.status,
      generatedCount: result.generatedCount,
      postIds,
      queueJobIds,
      queueStatuses: (queuedRows ?? []).map((row) => row.status),
      media,
    }))
  } finally {
    if (postIds.length > 0) {
      if (generatedObjectKeys.length === 0) {
        const { data: cleanupPosts } = await supabaseAdminClient
          .from('posts')
          .select('video_url')
          .in('id', postIds)
        for (const post of cleanupPosts ?? []) {
          const videoUrl = String(post.video_url ?? '')
          if (videoUrl.startsWith(process.env.R2_PUBLIC_BASE_URL ?? '')) {
            generatedObjectKeys.push(new URL(videoUrl).pathname.replace(/^\/+/, ''))
          }
        }
      }
      await supabaseAdminClient.from('publish_events').delete().in('post_id', postIds)
      await supabaseAdminClient.from('posts').delete().in('id', postIds)
    }
    if (queueJobIds.length > 0) {
      await supabaseAdminClient.from('queue_jobs').delete().in('id', queueJobIds)
    }
    cleanup.databaseRows = true
    if (sourceSuggestionId) {
      await supabaseAdminClient.from('source_suggestions').delete().eq('id', sourceSuggestionId)
      cleanup.sourceSuggestion = true
    }
    for (const objectKey of generatedObjectKeys) {
      await deleteR2Object(objectKey)
    }
    cleanup.generatedObjects = generatedObjectKeys.length > 0
    await deleteR2Object(SOURCE_OBJECT_KEY)
    cleanup.sourceObject = true

    if (jobId) {
      const queue = getClipGenerationQueue()
      const job = await queue.getJob(jobId)
      if (job && (await job.getState()) !== 'active') {
        await job.remove()
        cleanup.bullJob = true
      }
      await queue.close()
    }
    await getQueueConnection().quit()
    console.log(JSON.stringify({ event: 'cleanup', ...cleanup }))
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
