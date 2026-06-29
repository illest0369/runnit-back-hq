// Deprecated: RBHQ production publishing is Metricool-only.
// This legacy publish_jobs worker is intentionally disabled at the route layer.
import crypto from 'node:crypto'

import { writeAuditLog } from './audit-log'
import { markPublishJobStatus, publishDb } from './publish'
import type { PublishJobRecord } from './publish-shared'
import { normalizeClipState, transitionClipState } from './state-machine'
import { getMaxWorkerRetries, isWarRoomEnabled } from './war-room-runtime'

type PublishJob = Pick<
  PublishJobRecord,
  | 'id'
  | 'clip_id'
  | 'channel'
  | 'platform'
  | 'video_url'
  | 'caption'
  | 'hashtags'
  | 'publish_method'
  | 'attempts'
>

function signPayload(payload: unknown) {
  const secret = process.env.PUBLISH_WEBHOOK_SECRET || ''
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')
}

async function publishViaWebhook(job: PublishJob) {
  const url = process.env.PUBLISH_WEBHOOK_URL
  if (!url) {
    throw new Error('PUBLISH_WEBHOOK_URL is not configured')
  }

  const payload = {
    job_id: job.id,
    clip_id: job.clip_id,
    channel: job.channel,
    platform: job.platform,
    video_url: job.video_url,
    caption: job.caption ?? '',
    hashtags: job.hashtags ?? [],
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-runnit-signature': signPayload(payload),
    },
    body: JSON.stringify(payload),
  })

  const text = await res.text()

  if (!res.ok) {
    throw new Error(`Webhook failed ${res.status}: ${text}`)
  }

  return {
    external_post_id: text || null,
  }
}

async function publishViaPlaywright(job: PublishJob) {
  await markPublishJobStatus(job.id, 'manual_required', {
    last_error: 'Playwright adapter not implemented yet. Job moved to manual fallback.',
  })

  return null
}

async function publishViaDeviceRelay(job: PublishJob) {
  await markPublishJobStatus(job.id, 'manual_required', {
    last_error: 'Device relay adapter not implemented yet. Job moved to manual fallback.',
  })

  return null
}

async function processJob(job: PublishJob) {
  if (!isWarRoomEnabled()) {
    await writeAuditLog({
      clip_id: job.clip_id,
      post_id: job.clip_id,
      stage: 'PUBLISH_WORKER',
      actor: 'worker',
      decision: 'WAR_ROOM_DISABLED',
      reason: 'WAR_ROOM_DISABLED',
    })
    return
  }

  const approval = await readHumanApproval(job.clip_id)
  if (approval.state !== 'APPROVED_BY_HUMAN' || !approval.approvedByUserId) {
    await writeAuditLog({
      clip_id: job.clip_id,
      post_id: job.clip_id,
      stage: 'PUBLISH_WORKER',
      actor: 'worker',
      decision: 'SKIPPED_NOT_HUMAN_APPROVED',
      from_state: approval.state,
      reason: 'SKIPPED_NOT_HUMAN_APPROVED',
    })
    await markPublishJobStatus(job.id, 'manual_required', {
      last_error: 'SKIPPED_NOT_HUMAN_APPROVED',
    })
    return
  }

  if (job.attempts >= getMaxWorkerRetries()) {
    await transitionClipState({
      clipId: job.clip_id,
      currentState: approval.state,
      nextState: 'FAILED',
      actor: { type: 'worker', id: 'publish-worker' },
      reason: 'MAX_RETRIES_EXCEEDED',
    })
    await markPublishJobStatus(job.id, 'failed', {
      last_error: 'MAX_RETRIES_EXCEEDED',
    })
    return
  }

  await markPublishJobStatus(job.id, 'processing', {
    attempts: job.attempts + 1,
  })

  try {
    let result: { external_post_id: string | null } | null = null

    if (job.publish_method === 'webhook') {
      result = await publishViaWebhook(job)
    } else if (job.publish_method === 'playwright') {
      result = await publishViaPlaywright(job)
    } else if (job.publish_method === 'device') {
      result = await publishViaDeviceRelay(job)
    } else {
      await markPublishJobStatus(job.id, 'manual_required', {
        last_error: `Unsupported publish method: ${job.publish_method}`,
      })
      return
    }

    if (job.publish_method === 'webhook') {
      await markPublishJobStatus(job.id, 'posted', {
        external_post_id: result?.external_post_id ?? null,
        posted_at: new Date().toISOString(),
        last_error: null,
      })
      await transitionClipState({
        clipId: job.clip_id,
        currentState: 'APPROVED_BY_HUMAN',
        nextState: 'EXECUTED',
        actor: { type: 'worker', id: 'publish-worker' },
        reason: 'PUBLISH_WORKER_EXECUTED',
      })
      await writeAuditLog({
        clip_id: job.clip_id,
        post_id: job.clip_id,
        stage: 'PUBLISH_WORKER',
        actor: 'worker',
        decision: 'EXECUTED',
        from_state: 'APPROVED_BY_HUMAN',
        to_state: 'EXECUTED',
      })
    }
  } catch (error) {
    const attempts = job.attempts + 1
    const shouldRetry = attempts < getMaxWorkerRetries()

    await markPublishJobStatus(job.id, shouldRetry ? 'queued' : 'manual_required', {
      attempts,
      last_error: error instanceof Error ? error.message : 'Unknown publish error',
    })

    if (!shouldRetry) {
      await transitionClipState({
        clipId: job.clip_id,
        currentState: 'APPROVED_BY_HUMAN',
        nextState: 'FAILED',
        actor: { type: 'worker', id: 'publish-worker' },
        reason: 'MAX_RETRIES_EXCEEDED',
      })
    }
  }
}

export async function runPublishWorkerOnce() {
  if (!isWarRoomEnabled()) {
    await writeAuditLog({
      stage: 'PUBLISH_WORKER',
      actor: 'worker',
      decision: 'WAR_ROOM_DISABLED',
      reason: 'WAR_ROOM_DISABLED',
    })
    return { processed: 0 }
  }

  const { data, error } = await publishDb
    .from('publish_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(5)

  if (error) throw error
  if (!data?.length) return { processed: 0 }

  for (const job of data as PublishJob[]) {
    await processJob(job)
  }

  return { processed: data.length }
}

async function readHumanApproval(postId: string) {
  const { data, error } = await publishDb
    .from('posts')
    .select('id, status, approved_by_user_id, approved_by')
    .eq('id', postId)
    .maybeSingle()

  if (error) {
    throw error
  }

  const row = data as {
    status?: string | null
    approved_by_user_id?: string | null
    approved_by?: string | null
  } | null

  return {
    state: row ? normalizeClipState(row.status) : 'FAILED',
    approvedByUserId: row?.approved_by_user_id ?? row?.approved_by ?? null,
  }
}
