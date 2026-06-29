// Deprecated: RBHQ production publishing is Metricool-only.
// Legacy relay helpers remain for old clip-generation code paths only.
import { supabaseAdminClient } from './supabase-admin'
import { writeAuditLog } from './audit-log'
import { normalizeClipState, transitionClipState } from './state-machine'

const PLACEHOLDER_CAPTION = 'Placeholder caption until final hook/caption system is wired.'
const DEFAULT_DELIVERY_TARGETS = ['mobile_relay', 'playwright_agent', 'telegram_bot'] as const
const PLATFORM_TARGETS = ['tiktok', 'instagram_reels', 'youtube_shorts'] as const

type PublishDeliveryTarget = 'mobile_relay' | 'playwright_agent' | 'telegram_bot' | string

type PublishPostRow = {
  id: string
  channel_id: string | null
  status: string | null
  clip_url: string | null
  video_url: string | null
  caption: string | null
  publish_payload: unknown
}

type ChannelRow = {
  id: string
  name: string | null
  niche?: string | null
  category?: string | null
  handle?: string | null
}

export type PublishRelayPayload = {
  post_id: string
  clip_url: string
  caption: string
  channel: string
  delivery_target: PublishDeliveryTarget
  metadata: {
    source: 'runnit-back-hq'
    manual_posting_required: true
    platform_targets: string[]
  }
}

export function buildReadyPublishPayload(input: {
  postId: string
  clipUrl: string
  caption?: string | null
  channel: string
  createdAt?: string
}) {
  return {
    post_id: input.postId,
    clip_url: input.clipUrl,
    caption: normalizeCaption(input.caption),
    channel: input.channel,
    delivery_targets: [...DEFAULT_DELIVERY_TARGETS],
    created_at: input.createdAt ?? new Date().toISOString(),
    metadata: buildPublishMetadata(),
  }
}

export function buildPublishRelayPayload(input: {
  postId: string
  clipUrl: string
  caption?: string | null
  channel: string
  deliveryTarget: PublishDeliveryTarget
}): PublishRelayPayload {
  return {
    post_id: input.postId,
    clip_url: input.clipUrl,
    caption: normalizeCaption(input.caption),
    channel: input.channel,
    delivery_target: input.deliveryTarget,
    metadata: buildPublishMetadata(),
  }
}

export async function logPublishEvent(input: {
  postId?: string | null
  eventType: string
  payload?: unknown
  success: boolean
  error?: string | null
}) {
  const { error } = await supabaseAdminClient.from('publish_events').insert({
    post_id: input.postId ?? null,
    event_type: input.eventType,
    payload: input.payload ?? null,
    success: input.success,
    error: input.error ?? null,
  })

  if (error) {
    console.error('[publish-relay] failed to log event', {
      eventType: input.eventType,
      postId: input.postId,
      error: error.message,
    })
  }
}

export async function markGeneratedClipsReadyForPublish(input: {
  postIds: string[]
  channelId: string
}) {
  const selectedPostId = input.postIds[0]
  if (!selectedPostId) {
    return null
  }

  const now = new Date().toISOString()
  const channel = await resolveChannelName(input.channelId)

  const { data: selectedPost, error: selectedError } = await supabaseAdminClient
    .from('posts')
    .select('id, video_url, caption')
    .eq('id', selectedPostId)
    .single()

  if (selectedError || !selectedPost) {
    throw new Error(selectedError?.message || 'Selected post not found.')
  }

  const clipUrl = String(selectedPost.video_url || '').trim()
  if (!clipUrl) {
    throw new Error('Selected post is missing a clip URL.')
  }

  const caption = normalizeCaption(
    typeof selectedPost.caption === 'string' ? selectedPost.caption : null,
  )
  const publishPayload = buildReadyPublishPayload({
    postId: selectedPostId,
    clipUrl,
    caption,
    channel,
    createdAt: now,
  })

  let { error: updateError } = await supabaseAdminClient
    .from('posts')
    .update({ caption, status: 'ready_to_post', updated_at: now })
    .eq('id', selectedPostId)

  if (updateError?.message.includes('posts_status_check')) {
    ;({ error: updateError } = await supabaseAdminClient
      .from('posts')
      .update({ caption, status: 'approved', updated_at: now })
      .eq('id', selectedPostId))
  }

  if (updateError) {
    throw new Error(updateError.message)
  }

  await logPublishEvent({
    postId: selectedPostId,
    eventType: 'ready_to_post',
    payload: publishPayload,
    success: true,
  })

  return {
    postId: selectedPostId,
    clipUrl,
    publishPayload,
  }
}

export async function sendPostToPublishRelay(
  postId: string,
  deliveryTarget: PublishDeliveryTarget = 'mobile_relay',
) {
  let { data: post, error } = await supabaseAdminClient
    .from('posts')
    .select('id, channel_id, status, approved_by_user_id, approved_by, clip_url, video_url, caption, publish_payload')
    .eq('id', postId)
    .single()

  if (error?.message.includes('approved_by_user_id') || error?.message.includes('clip_url')) {
    ;({ data: post, error } = await supabaseAdminClient
      .from('posts')
      .select('id, channel_id, status, video_url, caption')
      .eq('id', postId)
      .single())
  }

  if (error || !post) {
    throw new Error(error?.message || 'Post not found.')
  }

  const typedPost = post as PublishPostRow
  const currentState = normalizeClipState(typedPost.status)
  const approvedByUserId =
    (post as { approved_by_user_id?: string | null; approved_by?: string | null })
      .approved_by_user_id ??
    (post as { approved_by?: string | null }).approved_by
  const isLegacyApproved = typedPost.status === 'approved' || typedPost.status === 'sent_to_buffer'
  if (!isLegacyApproved && (currentState !== 'APPROVED_BY_HUMAN' || !approvedByUserId)) {
    await writeAuditLog({
      clip_id: postId,
      post_id: postId,
      stage: 'PUBLISH_RELAY',
      actor: 'system',
      decision: 'SKIPPED_NOT_HUMAN_APPROVED',
      from_state: currentState,
      reason: 'SKIPPED_NOT_HUMAN_APPROVED',
    })
    throw new Error('Post is not human-approved for publish relay.')
  }

  const clipUrl = (typedPost.clip_url || typedPost.video_url || '').trim()
  if (!clipUrl) {
    throw new Error('Post is missing clip_url.')
  }

  const channel = await resolveChannelName(typedPost.channel_id)
  const payload = buildPublishRelayPayload({
    postId,
    clipUrl,
    caption: typedPost.caption,
    channel,
    deliveryTarget,
  })

  const webhookUrl = resolvePublishWebhookUrl()
  if (!process.env.PUBLISH_WEBHOOK_SECRET) {
    const message = 'PUBLISH_WEBHOOK_SECRET is required.'
    await recordDispatchFailure(postId, payload, message)
    throw new Error(message)
  }

  let failureRecorded = false

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-publish-secret': process.env.PUBLISH_WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    })
    const responseBody = await response.json().catch(() => null)

    if (!response.ok) {
      const message =
        responseBody && typeof responseBody === 'object' && 'error' in responseBody
          ? String(responseBody.error)
          : `Publish webhook failed with ${response.status}.`
      await recordDispatchFailure(postId, payload, message)
      failureRecorded = true
      throw new Error(message)
    }

    await logPublishEvent({
      postId,
      eventType: 'publish_webhook_success',
      payload: responseBody ?? payload,
      success: true,
    })

    let { error: clearError } = await supabaseAdminClient
      .from('posts')
      .update({ dispatch_error: null, updated_at: new Date().toISOString() })
      .eq('id', postId)

    if (clearError?.message.includes('dispatch_error')) {
      ;({ error: clearError } = await supabaseAdminClient
        .from('posts')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', postId))
    }

    if (!isLegacyApproved) {
      await transitionClipState({
        clipId: postId,
        currentState,
        nextState: 'EXECUTED',
        actor: { type: 'worker', id: 'publish-relay' },
        reason: 'PUBLISH_RELAY_SENT',
      })
    }

    return {
      ok: true,
      post_id: postId,
      status: isLegacyApproved ? 'sent_to_buffer' : 'EXECUTED',
      payload,
    }
  } catch (dispatchError) {
    const message = dispatchError instanceof Error ? dispatchError.message : 'Publish relay failed.'
    if (!failureRecorded) {
      await recordDispatchFailure(postId, payload, message)
    }
    throw dispatchError
  }
}

function normalizeCaption(value: string | null | undefined) {
  return value?.trim() || PLACEHOLDER_CAPTION
}

function buildPublishMetadata() {
  return {
    source: 'runnit-back-hq' as const,
    manual_posting_required: true as const,
    platform_targets: [...PLATFORM_TARGETS],
  }
}

async function resolveChannelName(channelId: string | null | undefined) {
  if (!channelId) {
    return 'sports'
  }

  const { data } = await supabaseAdminClient
    .from('channels')
    .select('id, name, niche, category, handle')
    .eq('id', channelId)
    .maybeSingle()

  const channel = data as ChannelRow | null
  return (
    channel?.niche?.trim() ||
    channel?.category?.trim() ||
    channel?.handle?.trim() ||
    channel?.name?.trim() ||
    'sports'
  )
}

function resolvePublishWebhookUrl() {
  if (process.env.PUBLISH_WEBHOOK_URL?.trim()) {
    return process.env.PUBLISH_WEBHOOK_URL.trim()
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
    'http://localhost:3000'

  return `${baseUrl.replace(/\/$/, '')}/api/webhooks/publish`
}

async function recordDispatchFailure(postId: string, payload: PublishRelayPayload, message: string) {
  await logPublishEvent({
    postId,
    eventType: 'publish_webhook_failed',
    payload,
    success: false,
    error: message,
  })

  await supabaseAdminClient
    .from('posts')
    .update({ dispatch_error: message, updated_at: new Date().toISOString() })
    .eq('id', postId)
}
