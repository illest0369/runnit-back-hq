import { createHash, randomUUID } from 'node:crypto'
import { Queue, type Queue as QueueType } from 'bullmq'
import type IORedisType from 'ioredis'

import { createRedisConnection, getSharedRedisConnection } from './redis'
import { getMaxAgentRetries, isWarRoomEnabled } from './war-room-runtime'

export const CLIP_GENERATION_QUEUE_NAME = 'clip-generation'
export const RBHQ_INGEST_QUEUE_NAME = 'rbhq-ingest'
export const RBHQ_APIFY_POLL_QUEUE_NAME = 'rbhq-apify-poll'
export const RBHQ_SCORE_QUEUE_NAME = 'rbhq-score'
export const RBHQ_POST_QUEUE_NAME = process.env.RBHQ_POST_QUEUE_NAME?.trim() || 'rbhq-post'
export const RBHQ_ANALYTICS_QUEUE_NAME = 'rbhq-analytics'

export type ClipGenerationJobData = {
  videoUrl: string
  channelId: string
  requestedByUserId: string
  sourceSuggestionId?: string | null
  moderationClipId?: string | null
}

export type ClipGenerationJobProgress = {
  step: string
  percent: number
  message: string
}

export type ClipGenerationJobResult = {
  sourceVideoUrl: string
  generatedCount: number
  postIds: string[]
  queueJobIds: string[]
}

export type RbhqIngestJobData = {
  platform: 'youtube' | 'tiktok' | 'instagram' | 'reddit'
  actorId?: string
  input: Record<string, unknown>
  mode?: 'native' | 'curated' | 'discovery' | 'apify'
  sourceIds?: string[]
  sourceCount?: number
}

export type RbhqApifyPollJobData = {
  platform: 'youtube' | 'tiktok' | 'instagram' | 'reddit'
  runId: string
  mode?: 'native' | 'curated' | 'discovery' | 'apify'
  sourceIds?: string[]
  sourceCount?: number
}

export type RbhqScoreJobData = {
  clipId: string
}

export type RbhqPostJobData = {
  postId: string
  clipId?: string
  channelId?: string | null
  lane?: {
    id: string
    slug: string
    label: string
    name: string
  } | null
  tiktok?: {
    channelKey: string | null
    handle: string | null
    profileUrl: string | null
  } | null
  caption?: string
  hashtags?: string[]
  dryRun?: true
  enqueuedAt?: string
}

export type RbhqAnalyticsJobData = {
  postId: string
}

declare global {
  // Cache the Redis clients during local hot reloads so the dev server stays stable.
  var __runnitbackRedis: IORedisType | undefined
  var __runnitbackClipQueue:
    | QueueType<ClipGenerationJobData, ClipGenerationJobResult, 'generate-clips'>
    | undefined
  var __rbhqIngestQueue: QueueType<RbhqIngestJobData, string, 'run-apify-actor'> | undefined
  var __rbhqApifyPollQueue: QueueType<RbhqApifyPollJobData, string, 'poll-apify-run'> | undefined
  var __rbhqScoreQueue: QueueType<RbhqScoreJobData, string, 'score-clip'> | undefined
  var __rbhqPostQueue: QueueType<RbhqPostJobData, string, 'post-to-tiktok'> | undefined
  var __rbhqAnalyticsQueue: QueueType<RbhqAnalyticsJobData, string, 'poll-tiktok-analytics'> | undefined
}

export function getQueueConnection() {
  if (!globalThis.__runnitbackRedis) {
    globalThis.__runnitbackRedis = getSharedRedisConnection()
  }

  return globalThis.__runnitbackRedis
}

export function createWorkerConnection() {
  return createRedisConnection()
}

export function getClipGenerationQueue() {
  if (!globalThis.__runnitbackClipQueue) {
    globalThis.__runnitbackClipQueue = new Queue<
      ClipGenerationJobData,
      ClipGenerationJobResult,
      'generate-clips'
    >(CLIP_GENERATION_QUEUE_NAME, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    })
  }

  return globalThis.__runnitbackClipQueue
}

export async function enqueueClipGenerationJob(input: ClipGenerationJobData) {
  const queue = getClipGenerationQueue()
  const jobId = randomUUID()
  const job = await queue.add('generate-clips', input, {
    attempts: getMaxAgentRetries(),
    jobId,
  })

  return String(job.id)
}

function defaultRbhqJobOptions() {
  return {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 15_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  }
}

export function getRbhqIngestQueue() {
  if (!globalThis.__rbhqIngestQueue) {
    globalThis.__rbhqIngestQueue = new Queue<RbhqIngestJobData, string, 'run-apify-actor'>(
      RBHQ_INGEST_QUEUE_NAME,
      { connection: getQueueConnection(), defaultJobOptions: defaultRbhqJobOptions() },
    )
  }
  return globalThis.__rbhqIngestQueue
}

export function getRbhqApifyPollQueue() {
  if (!globalThis.__rbhqApifyPollQueue) {
    globalThis.__rbhqApifyPollQueue = new Queue<RbhqApifyPollJobData, string, 'poll-apify-run'>(
      RBHQ_APIFY_POLL_QUEUE_NAME,
      { connection: getQueueConnection(), defaultJobOptions: defaultRbhqJobOptions() },
    )
  }
  return globalThis.__rbhqApifyPollQueue
}

export function getRbhqScoreQueue() {
  if (!globalThis.__rbhqScoreQueue) {
    globalThis.__rbhqScoreQueue = new Queue<RbhqScoreJobData, string, 'score-clip'>(
      RBHQ_SCORE_QUEUE_NAME,
      { connection: getQueueConnection(), defaultJobOptions: defaultRbhqJobOptions() },
    )
  }
  return globalThis.__rbhqScoreQueue
}

export function getRbhqPostQueue() {
  if (!globalThis.__rbhqPostQueue) {
    globalThis.__rbhqPostQueue = new Queue<RbhqPostJobData, string, 'post-to-tiktok'>(
      RBHQ_POST_QUEUE_NAME,
      { connection: getQueueConnection(), defaultJobOptions: defaultRbhqJobOptions() },
    )
  }
  return globalThis.__rbhqPostQueue
}

export function getRbhqAnalyticsQueue() {
  if (!globalThis.__rbhqAnalyticsQueue) {
    globalThis.__rbhqAnalyticsQueue = new Queue<RbhqAnalyticsJobData, string, 'poll-tiktok-analytics'>(
      RBHQ_ANALYTICS_QUEUE_NAME,
      { connection: getQueueConnection(), defaultJobOptions: defaultRbhqJobOptions() },
    )
  }
  return globalThis.__rbhqAnalyticsQueue
}

export async function enqueueRbhqIngestJob(input: RbhqIngestJobData) {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ actorInput: input.input, mode: input.mode, sourceIds: input.sourceIds }))
    .digest('hex')
    .slice(0, 16)
  const rerunSuffix = input.mode === 'native' || input.mode === 'curated' ? `-${Date.now()}` : ''
  const job = await getRbhqIngestQueue().add('run-apify-actor', input, {
    jobId: `rbhq-ingest-${input.platform}-${input.actorId ?? input.mode ?? 'native'}-${fingerprint}${rerunSuffix}`,
  })
  return String(job.id)
}

export async function enqueueRbhqApifyPollJob(input: RbhqApifyPollJobData, delay = 30_000) {
  const job = await getRbhqApifyPollQueue().add('poll-apify-run', input, {
    delay,
    jobId: `rbhq-apify-${input.runId}-${Date.now()}`,
  })
  return String(job.id)
}

export async function enqueueRbhqScoreJob(input: RbhqScoreJobData) {
  return String(await getRbhqScoreQueue().add('score-clip', input, { jobId: `rbhq-score-${input.clipId}` }))
}

export async function enqueueRbhqPostJob(input: RbhqPostJobData) {
  const job = await getRbhqPostQueue().add('post-to-tiktok', input, {
    jobId: `rbhq-post-${input.postId}`,
  })

  return String(job.id)
}

export async function enqueueRbhqAnalyticsJob(input: RbhqAnalyticsJobData, delay = 30 * 60_000) {
  return String(await getRbhqAnalyticsQueue().add('poll-tiktok-analytics', input, { delay }))
}

function normalizeProgress(progress: unknown): ClipGenerationJobProgress | null {
  if (!progress || typeof progress !== 'object') {
    return null
  }

  const candidate = progress as Partial<ClipGenerationJobProgress>
  if (
    typeof candidate.step !== 'string' ||
    typeof candidate.percent !== 'number' ||
    typeof candidate.message !== 'string'
  ) {
    return null
  }

  return {
    step: candidate.step,
    percent: candidate.percent,
    message: candidate.message,
  }
}

export async function getClipGenerationJobStatus(jobId: string) {
  const queue = getClipGenerationQueue()
  const job = await queue.getJob(jobId)

  if (!job) {
    return null
  }

  return {
    id: String(job.id),
    state: await job.getState(),
    progress: normalizeProgress(job.progress),
    failedReason: job.failedReason || null,
    result: (job.returnvalue ?? null) as ClipGenerationJobResult | null,
    data: job.data,
  }
}
