// Deprecated: RBHQ production publishing is Metricool-only.
// This legacy publish_jobs helper is intentionally no longer called by active routes.
import { createClient } from '@supabase/supabase-js'
import { writeAuditLog } from './audit-log'
import { normalizeClipState } from './state-machine'
import type { PublishJobInput, PublishJobRecord, PublishJobStatus, PublishMethod } from './publish-shared'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function createMissingPublishDbClient() {
  return new Proxy(
    {},
    {
      get() {
        throw new Error('Supabase publish env vars are required.')
      },
    },
  )
}

export const publishDb =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      })
    : (createMissingPublishDbClient() as ReturnType<typeof createClient>)

function resolvePublishMethod(value: unknown): PublishMethod {
  return value === 'playwright' || value === 'device' || value === 'manual' || value === 'webhook'
    ? value
    : 'webhook'
}

export async function createPublishJob(input: PublishJobInput) {
  if (!input.clip_id) throw new Error('clip_id is required')
  if (!input.channel) throw new Error('channel is required')
  if (!input.video_url) throw new Error('video_url is required')

  const { data: post, error: postError } = await publishDb
    .from('posts')
    .select('id, status, approved_by_user_id, approved_by')
    .eq('id', input.clip_id)
    .maybeSingle()

  if (postError) throw postError

  const postState = post ? normalizeClipState((post as { status?: string } | null)?.status) : 'FAILED'
  const approvedByUserId = (post as { approved_by_user_id?: string | null; approved_by?: string | null } | null)
    ?.approved_by_user_id ?? (post as { approved_by?: string | null } | null)?.approved_by
  if (postState !== 'APPROVED_BY_HUMAN' || !approvedByUserId) {
    await writeAuditLog({
      clip_id: input.clip_id,
      post_id: input.clip_id,
      stage: 'PUBLISH_ENQUEUE',
      actor: 'system',
      decision: 'BLOCKED',
      from_state: postState,
      reason: 'PUBLISH_REQUIRES_HUMAN_APPROVAL',
    })
    throw new Error('Publish enqueue requires APPROVED_BY_HUMAN and approved_by_user_id.')
  }

  const { data, error } = await publishDb
    .from('publish_jobs')
    .insert({
      clip_id: input.clip_id,
      channel: input.channel,
      platform: input.platform ?? 'tiktok',
      video_url: input.video_url,
      caption: input.caption ?? '',
      hashtags: input.hashtags ?? [],
      publish_method: input.publish_method ?? resolvePublishMethod(process.env.PUBLISH_METHOD),
      status: 'queued',
    })
    .select('*')
    .single()

  if (error) {
    const missingPublishJobsTable =
      error.code === 'PGRST205' || /publish_jobs/i.test(error.message ?? '')

    if (!missingPublishJobsTable) {
      throw error
    }

    const { data: post, error: postError } = await publishDb
      .from('posts')
      .upsert(
        {
          clip_id: input.clip_id,
          platform: input.platform ?? 'tiktok',
          status: 'queued',
          destination: 'manual',
          video_url: input.video_url,
          caption: input.caption ?? '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'clip_id,platform' },
      )
      .select('*')
      .single()

    if (postError) throw postError

    return {
      id: post.id,
      clip_id: post.clip_id,
      channel: input.channel,
      platform: post.platform,
      status: 'queued',
      video_url: post.video_url,
      caption: post.caption,
      hashtags: input.hashtags ?? [],
      publish_method: input.publish_method ?? resolvePublishMethod(process.env.PUBLISH_METHOD),
      attempts: 0,
      last_error: null,
      external_post_id: null,
      created_at: post.created_at,
      updated_at: post.updated_at ?? post.created_at,
      posted_at: null,
    } as PublishJobRecord
  }
  return data as PublishJobRecord
}

export async function markPublishJobStatus(
  id: string,
  status: PublishJobStatus,
  patch: Record<string, unknown> = {},
) {
  const { data, error } = await publishDb
    .from('publish_jobs')
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...patch,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as PublishJobRecord
}
