// LEGACY — not used in active ingest pipeline
import 'server-only'

import { getSession, type SessionUser } from '@/lib/auth'
import {
  buildPreviewVideoUrl,
  resolvePublishDestination,
  type PublishLogStep,
  type PublishPostRecord,
  type QueueJobPreview,
  type SocialAccountRecord,
} from '@/lib/publish-shared'
import { supabaseAdmin } from '@/lib/supabase'

type ChannelRecord = {
  id: string
  name: string
  handle: string
  tiktok_handle: string | null
  tiktok_token: string | null
  tiktok_refresh_token: string | null
  tiktok_expires_at: string | null
}

type QueueJobRow = QueueJobPreview & {
  id: string
  channel_id: string
}

function serializeResponse(response: unknown): string | number | boolean | Record<string, unknown> | null {
  if (response == null) {
    return null
  }

  if (
    typeof response === 'string' ||
    typeof response === 'number' ||
    typeof response === 'boolean'
  ) {
    return response
  }

  if (response instanceof Error) {
    return {
      name: response.name,
      message: response.message,
    }
  }

  try {
    return JSON.parse(JSON.stringify(response)) as Record<string, unknown>
  } catch {
    return { value: String(response) }
  }
}

async function getChannel(channelId: string): Promise<ChannelRecord> {
  const { data, error } = await supabaseAdmin
    .from('channels')
    .select('id, name, handle, tiktok_handle, tiktok_token, tiktok_refresh_token, tiktok_expires_at')
    .eq('id', channelId)
    .single()

  if (error || !data) {
    throw new Error('Channel not found.')
  }

  return data as ChannelRecord
}

export async function requireChannelAccess(channelId: string): Promise<SessionUser> {
  const session = await getSession()

  if (!session) {
    throw new Error('Unauthorized')
  }

  if (!session.channelIds.includes(channelId)) {
    throw new Error('Forbidden')
  }

  return session
}

export async function ensureSocialAccount(channelId: string): Promise<SocialAccountRecord> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('social_accounts')
    .select('*')
    .eq('channel_id', channelId)
    .eq('platform', 'tiktok')
    .maybeSingle()

  if (existingError) {
    throw new Error(existingError.message)
  }

  const channel = await getChannel(channelId)

  if (existing) {
    const needsSync =
      (!existing.account_name && !!channel.name) ||
      (!existing.access_token && !!channel.tiktok_token) ||
      (!existing.refresh_token && !!channel.tiktok_refresh_token) ||
      (!existing.expires_at && !!channel.tiktok_expires_at) ||
      (!existing.is_approved && !!channel.tiktok_token)

    if (!needsSync) {
      return existing as SocialAccountRecord
    }

    const { data: synced, error: syncError } = await supabaseAdmin
      .from('social_accounts')
      .update({
        account_name: existing.account_name || channel.tiktok_handle || channel.name || channel.handle,
        access_token: existing.access_token ?? channel.tiktok_token ?? null,
        refresh_token: existing.refresh_token ?? channel.tiktok_refresh_token ?? null,
        expires_at: existing.expires_at ?? channel.tiktok_expires_at ?? null,
        is_approved: existing.is_approved || Boolean(existing.access_token ?? channel.tiktok_token),
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (syncError || !synced) {
      throw new Error(syncError?.message || 'Unable to sync social account.')
    }

    return synced as SocialAccountRecord
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from('social_accounts')
    .insert({
      channel_id: channelId,
      platform: 'tiktok',
      account_name: channel.tiktok_handle || channel.name || channel.handle,
      access_token: channel.tiktok_token,
      refresh_token: channel.tiktok_refresh_token,
      expires_at: channel.tiktok_expires_at,
      is_approved: Boolean(channel.tiktok_token),
      buffer_profile_id: null,
      buffer_connected: false,
    })
    .select('*')
    .single()

  if (createError || !created) {
    throw new Error(createError?.message || 'Unable to create social account.')
  }

  return created as SocialAccountRecord
}

export async function upsertBufferConnection(
  channelId: string,
  bufferProfileId: string,
  accountName?: string,
): Promise<SocialAccountRecord> {
  const account = await ensureSocialAccount(channelId)

  const { data, error } = await supabaseAdmin
    .from('social_accounts')
    .update({
      account_name: accountName?.trim() || account.account_name,
      buffer_profile_id: bufferProfileId.trim(),
      buffer_connected: true,
    })
    .eq('id', account.id)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Unable to connect Buffer.')
  }

  return data as SocialAccountRecord
}

export async function createPublishLog(
  postId: string,
  step: PublishLogStep,
  status: string,
  response?: unknown,
): Promise<void> {
  const { error } = await supabaseAdmin.from('publish_logs').insert({
    post_id: postId,
    step,
    status,
    response: serializeResponse(response),
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function updatePostRecord(
  postId: string,
  patch: Partial<PublishPostRecord>,
): Promise<PublishPostRecord> {
  const { data, error } = await supabaseAdmin
    .from('posts')
    .update(patch)
    .eq('id', postId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Unable to update post.')
  }

  return data as PublishPostRecord
}

export async function getQueueJobsForChannel(
  channelId: string,
  clipIds: string[],
): Promise<QueueJobRow[]> {
  if (clipIds.length === 0) {
    return []
  }

  const { data, error } = await supabaseAdmin
    .from('queue_jobs')
    .select('id, channel_id, clip_url, source_url, post_package')
    .eq('channel_id', channelId)
    .in('id', clipIds)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as QueueJobRow[]
}

export async function ensurePostsForChannelClips(
  channelId: string,
  clipIds: string[],
): Promise<PublishPostRecord[]> {
  const account = await ensureSocialAccount(channelId)
  const queueJobs = await getQueueJobsForChannel(channelId, clipIds)

  if (queueJobs.length === 0) {
    return []
  }

  const destination = resolvePublishDestination(account)

  const { data: existingPosts, error: existingPostsError } = await supabaseAdmin
    .from('posts')
    .select('*')
    .eq('platform', 'tiktok')
    .in('clip_id', queueJobs.map((job) => job.id))

  if (existingPostsError) {
    throw new Error(existingPostsError.message)
  }

  const existingByClipId = new Map(
    (existingPosts ?? []).map((post) => [post.clip_id as string, post as PublishPostRecord]),
  )

  const missingPosts = queueJobs
    .filter((job) => !existingByClipId.has(job.id))
    .map((job) => ({
      clip_id: job.id,
      status: 'ready',
      platform: 'tiktok',
      destination,
      caption: '',
      video_url: buildPreviewVideoUrl(job),
      scheduled_time: null,
    }))
    .filter((post) => post.video_url)

  if (missingPosts.length > 0) {
    const { error: insertError } = await supabaseAdmin.from('posts').insert(missingPosts)

    if (insertError) {
      throw new Error(insertError.message)
    }
  }

  const { error: syncError } = await supabaseAdmin
    .from('posts')
    .update({ destination })
    .eq('platform', 'tiktok')
    .eq('status', 'ready')
    .in('clip_id', queueJobs.map((job) => job.id))

  if (syncError) {
    throw new Error(syncError.message)
  }

  const { data: refreshedPosts, error: refreshedPostsError } = await supabaseAdmin
    .from('posts')
    .select('*')
    .eq('platform', 'tiktok')
    .in('clip_id', queueJobs.map((job) => job.id))

  if (refreshedPostsError) {
    throw new Error(refreshedPostsError.message)
  }

  const orderedByClipId = new Map(
    (refreshedPosts ?? []).map((post) => [post.clip_id as string, post as PublishPostRecord]),
  )

  return queueJobs
    .map((job) => orderedByClipId.get(job.id))
    .filter((post): post is PublishPostRecord => Boolean(post))
}

export async function publishToBuffer(
  post: Pick<PublishPostRecord, 'caption' | 'video_url' | 'scheduled_time'>,
  account: Pick<SocialAccountRecord, 'buffer_profile_id'>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const bufferApiKey = process.env.BUFFER_API_KEY

  if (!bufferApiKey) {
    throw new Error('BUFFER_API_KEY is not configured.')
  }

  if (!account.buffer_profile_id) {
    throw new Error('Buffer profile is not connected.')
  }

  const payload: Record<string, unknown> = {
    profile_ids: [account.buffer_profile_id],
    text: post.caption,
    media: {
      video: post.video_url,
    },
  }

  if (post.scheduled_time) {
    payload.scheduled_at = post.scheduled_time
  }

  const response = await fetch('https://api.bufferapp.com/1/updates/create.json', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bufferApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  const raw = await response.text()
  let data: unknown = raw

  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = raw
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  }
}
