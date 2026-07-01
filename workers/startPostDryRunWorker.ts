import { Worker } from 'bullmq'

import {
  createWorkerConnection,
  RBHQ_POST_QUEUE_NAME,
  type RbhqPostJobData,
} from '../lib/queue'
import { getClipById } from '../lib/moderation-queue'

const READY_STATUSES = new Set([
  'metricool_ready_manual_export',
  'ready_for_manual_publish',
])

function assertRequiredEnv() {
  const missing = ['REDIS_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    .filter((name) => !process.env[name]?.trim())

  if (!process.env.SUPABASE_URL?.trim() && !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    missing.push('SUPABASE_URL')
  }

  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(', ')}`)
  }
}

async function startPostDryRunWorker() {
  assertRequiredEnv()

  const postWorker = new Worker<RbhqPostJobData, string, 'post-to-tiktok'>(
    RBHQ_POST_QUEUE_NAME,
    async (job) => {
      const clip = await getClipById(job.data.postId, { includeMetricoolHandoffStatus: false })

      if (!clip) {
        throw new Error('CLIP_NOT_FOUND')
      }

      if (clip.status !== 'approved') {
        throw new Error(`CLIP_NOT_APPROVED:${clip.status}`)
      }

      if (!clip.video_url?.trim()) {
        throw new Error('CLIP_MISSING_RENDERED_VIDEO')
      }

      if (!READY_STATUSES.has(clip.publish_status)) {
        throw new Error(`CLIP_NOT_READY_FOR_MAC_MINI_POST:${clip.publish_status}`)
      }

      console.log('[rbhq-post] dry-run received approved clip', {
        postId: clip.id,
        channelId: clip.channel_id,
        publishStatus: clip.publish_status,
      })

      return `dry-run:post:${clip.id}`
    },
    { connection: createWorkerConnection(), concurrency: 1 },
  )

  postWorker.on('ready', () => {
    console.log(`[rbhq-post] dry-run worker ready on queue "${RBHQ_POST_QUEUE_NAME}"`)
  })

  postWorker.on('completed', (job, result) => {
    console.log('[rbhq-post] dry-run completed', job.id, result)
  })

  postWorker.on('failed', (job, error) => {
    console.error('[rbhq-post] dry-run failed', job?.id ?? 'unknown', error.message)
  })

  postWorker.on('error', (error) => {
    console.error('[rbhq-post] dry-run worker error:', error.message)
  })

  async function shutdown(signal: string) {
    console.log(`[rbhq-post] dry-run worker shutting down on ${signal}`)
    await postWorker.close()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
}

startPostDryRunWorker().catch((error) => {
  console.error('[rbhq-post] dry-run boot failed:', error)
  process.exit(1)
})
