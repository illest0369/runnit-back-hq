// LEGACY — not used in active ingest pipeline
import 'server-only'

import { buildPreviewVideoUrl, type QueueJobPreview } from '@/lib/publish-shared'
import { getSession, getSessionFromRequest, type SessionUser } from '@/lib/auth'
import { toAppChannel } from '@/lib/channel-meta'
import { supabaseAdmin } from '@/lib/supabase'
import { buildYouTubeEmbedUrl } from '@/lib/youtube'
import {
  analyzeReplies,
  generateReplySuggestions,
  isDirectVideoAsset,
  normalizeChannelStatus,
  normalizeHashtags,
  normalizePostStatus,
  normalizeRole,
  scoreComment,
  type AppChannel,
  type AppPost,
  type AppRole,
  type AppUserSettings,
  type CommentIntelligence,
  type ReplyAnalysis,
} from '@/lib/runnitback'
import {
  getReplyLearningContext as getWorkerLearningContext,
  refreshLearningWeights,
} from '@/services/learningService'

type SessionWithRole = {
  userId: string
  username: string
  role: AppRole
  channelIds: string[]
}

type ChannelRow = {
  id: string
  name: string
  niche: string | null
  tiktok_profile_url: string | null
  buffer_profile_id: string | null
  status: string | null
}

type PostRow = {
  id: string
  clip_id?: string | null
  channel_id: string | null
  clip_url?: string | null
  video_url: string | null
  source_video_url?: string | null
  preview_url?: string | null
  tiktok_url: string | null
  hook: string | null
  caption: string | null
  hashtags: unknown
  score: number | string | null
  performance_score?: number | string | null
  performance_label?: string | null
  feedback_vote?: string | null
  feedback_reason?: string | null
  status: string | null
  comment_count_hint: number | null
  priority_score: number | string | null
  thumbnail_url: string | null
  created_at: string
  updated_at: string | null
}

type QueueJobRow = QueueJobPreview & {
  id: string
  channel_id: string
  score: number | null
  status: string | null
}

type PostLogRow = {
  job_id: string | null
  tiktok_post_url: string | null
}

type ReplySessionRow = {
  comment_type: string
  generated_suggestions: unknown
  final_reply_text: string | null
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function normalizeChannel(row: ChannelRow): AppChannel {
  return {
    id: row.id,
    name: row.name,
    niche: row.niche?.trim() || 'general',
    tiktok_profile_url: row.tiktok_profile_url,
    buffer_profile_id: row.buffer_profile_id,
    status: normalizeChannelStatus(row.status),
  }
}

function normalizePost(row: PostRow, channel: AppChannel): AppPost {
  const bestVideoUrl = row.clip_url || row.video_url
  const directVideoUrl = bestVideoUrl && isDirectVideoAsset(bestVideoUrl) ? bestVideoUrl : null
  const previewUrl =
    row.preview_url ??
    buildYouTubeEmbedUrl(row.source_video_url) ??
    buildYouTubeEmbedUrl(bestVideoUrl)

  return {
    id: row.id,
    channel_id: channel.id,
    video_url: directVideoUrl,
    clip_url: row.clip_url ?? null,
    preview_url: previewUrl,
    source_video_url: row.source_video_url,
    tiktok_url: row.tiktok_url,
    hook: row.hook?.trim() || 'Untitled post',
    caption: row.caption?.trim() || '',
    hashtags: normalizeHashtags(row.hashtags),
    score: toNumber(row.score),
    performance_score: toNumber(row.performance_score),
    performance_label:
      row.performance_label === 'hit' ||
      row.performance_label === 'strong' ||
      row.performance_label === 'decent'
        ? row.performance_label
        : 'flop',
    feedback_vote:
      row.feedback_vote === 'up' || row.feedback_vote === 'down' ? row.feedback_vote : null,
    feedback_reason: row.feedback_reason ?? null,
    status: normalizePostStatus(row.status),
    comment_count_hint: row.comment_count_hint ?? 0,
    priority_score: toNumber(row.priority_score),
    thumbnail_url: row.thumbnail_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    channel,
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function getLegacyChannelAccess(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('user_channel_access')
    .select('channel_id')
    .eq('user_id', userId)

  if (!error) {
    return (data ?? []).map((row: { channel_id: string }) => row.channel_id)
  }

  const fallback = await supabaseAdmin
    .from('user_channels')
    .select('channel_id')
    .eq('user_id', userId)

  if (fallback.error) {
    throw new Error(fallback.error.message)
  }

  return (fallback.data ?? []).map((row: { channel_id: string }) => row.channel_id)
}

export async function requireAppSession(): Promise<SessionWithRole> {
  const session = await getSession()

  return requireSessionWithRole(session)
}

export async function requireAppSessionFromRequest(request: Request): Promise<SessionWithRole> {
  const session = await getSessionFromRequest(request)

  return requireSessionWithRole(session)
}

async function requireSessionWithRole(session: SessionUser | null): Promise<SessionWithRole> {
  if (!session) {
    throw new Error('Unauthorized')
  }

  const channelIds = session.channelIds.length
    ? session.channelIds
    : await getLegacyChannelAccess(session.userId)

  return {
    userId: session.userId,
    username: session.username,
    role: normalizeRole(session.role),
    channelIds,
  }
}

export async function getAccessibleChannels(session: SessionWithRole): Promise<AppChannel[]> {
  if (session.channelIds.length === 0) {
    return []
  }

  const { data, error } = await supabaseAdmin
    .from('channels')
    .select('id, name, niche, tiktok_profile_url, buffer_profile_id, status')
    .in('id', session.channelIds)
    .order('name')

  if (error) {
    throw new Error(error.message)
  }

  const channels = (data ?? []).map((row) => normalizeChannel(row as ChannelRow))
  const channelsById = new Set(channels.map((channel) => channel.id))
  const fallbackChannels = session.channelIds
    .filter((channelId) => !channelsById.has(channelId))
    .map((channelId) => toAppChannel(channelId))
    .filter((channel): channel is AppChannel => Boolean(channel))

  return [...channels, ...fallbackChannels]
}

export async function ensureUserSettings(
  session: SessionWithRole,
): Promise<AppUserSettings> {
  if (!isUuid(session.userId)) {
    return {
      id: `session:${session.userId}`,
      user_id: session.userId,
      default_channel_id: session.channelIds[0] ?? null,
      notifications_enabled: true,
      view_preference: 'compact',
    }
  }

  const { data: existing, error } = await supabaseAdmin
    .from('user_settings')
    .select('id, user_id, default_channel_id, notifications_enabled, view_preference')
    .eq('user_id', session.userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (existing) {
    return {
      id: existing.id,
      user_id: existing.user_id,
      default_channel_id: existing.default_channel_id,
      notifications_enabled: existing.notifications_enabled,
      view_preference: existing.view_preference === 'comfortable' ? 'comfortable' : 'compact',
    }
  }

  const { data: created, error: insertError } = await supabaseAdmin
    .from('user_settings')
    .insert({
      user_id: session.userId,
      default_channel_id: session.channelIds[0] ?? null,
      notifications_enabled: true,
      view_preference: 'compact',
    })
    .select('id, user_id, default_channel_id, notifications_enabled, view_preference')
    .single()

  if (insertError || !created) {
    throw new Error(insertError?.message || 'Unable to create user settings.')
  }

  return {
    id: created.id,
    user_id: created.user_id,
    default_channel_id: created.default_channel_id,
    notifications_enabled: created.notifications_enabled,
    view_preference: created.view_preference === 'comfortable' ? 'comfortable' : 'compact',
  }
}

export async function saveUserSettings(
  session: SessionWithRole,
  patch: Partial<Pick<AppUserSettings, 'default_channel_id' | 'notifications_enabled' | 'view_preference'>>,
): Promise<AppUserSettings> {
  const current = await ensureUserSettings(session)
  const nextDefaultChannelId = patch.default_channel_id ?? current.default_channel_id

  if (nextDefaultChannelId && !session.channelIds.includes(nextDefaultChannelId)) {
    throw new Error('Forbidden')
  }

  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .update({
      default_channel_id: nextDefaultChannelId,
      notifications_enabled: patch.notifications_enabled ?? current.notifications_enabled,
      view_preference: patch.view_preference ?? current.view_preference,
    })
    .eq('user_id', session.userId)
    .select('id, user_id, default_channel_id, notifications_enabled, view_preference')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Unable to save settings.')
  }

  return {
    id: data.id,
    user_id: data.user_id,
    default_channel_id: data.default_channel_id,
    notifications_enabled: data.notifications_enabled,
    view_preference: data.view_preference === 'comfortable' ? 'comfortable' : 'compact',
  }
}

export async function syncLegacyPostsForChannels(channelIds: string[]): Promise<void> {
  if (channelIds.length === 0) {
    return
  }

  const { data: queueJobs, error: queueJobsError } = await supabaseAdmin
    .from('queue_jobs')
    .select('id, channel_id, clip_url, source_url, score, status, post_package')
    .in('channel_id', channelIds)

  if (queueJobsError) {
    throw new Error(queueJobsError.message)
  }

  const jobs = (queueJobs ?? []) as QueueJobRow[]
  if (jobs.length === 0) {
    return
  }

  const invalidClipUrlJobIds = jobs
    .filter((job) => job.clip_url && !isDirectVideoAsset(job.clip_url))
    .map((job) => job.id)

  if (invalidClipUrlJobIds.length > 0) {
    await supabaseAdmin
      .from('queue_jobs')
      .update({ clip_url: null })
      .in('id', invalidClipUrlJobIds)

    jobs.forEach((job) => {
      if (invalidClipUrlJobIds.includes(job.id)) {
        job.clip_url = null
      }
    })
  }

  const jobIds = jobs.map((job) => job.id)

  const [{ data: existingPosts, error: existingPostsError }, { data: postLogs, error: postLogError }] =
    await Promise.all([
      supabaseAdmin
        .from('posts')
        .select('id, clip_id, channel_id, video_url, source_video_url, hook, caption, hashtags, score, status, comment_count_hint, priority_score, thumbnail_url, tiktok_url, created_at, updated_at')
        .in('clip_id', jobIds),
      supabaseAdmin
        .from('post_log')
        .select('job_id, tiktok_post_url')
        .in('job_id', jobIds),
    ])

  if (existingPostsError) {
    throw new Error(existingPostsError.message)
  }

  if (postLogError) {
    throw new Error(postLogError.message)
  }

  const existingByClipId = new Map<string, PostRow>()
  ;(existingPosts ?? []).forEach((row) => {
    const clipId = (row as PostRow).clip_id
    if (clipId) {
      existingByClipId.set(clipId, row as PostRow)
    }
  })

  const postLogByJobId = new Map<string, string>()
  ;((postLogs ?? []) as PostLogRow[]).forEach((log) => {
    if (log.job_id && log.tiktok_post_url) {
      postLogByJobId.set(log.job_id, log.tiktok_post_url)
    }
  })

  const inserts: Array<Record<string, unknown>> = []
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []

  jobs.forEach((job) => {
    const previewUrl = buildPreviewVideoUrl(job)
    if (!previewUrl) {
      return
    }

    const directVideoUrl = isDirectVideoAsset(previewUrl) ? previewUrl : null
    const storedVideoUrl = directVideoUrl ?? previewUrl
    const score = toNumber(job.score)
    const thumbnailUrl = job.post_package?.thumbnail?.trim() || null
    const hook = job.post_package?.title?.trim() || 'Untitled post'
    const tiktokUrl = postLogByJobId.get(job.id) ?? null
    const mappedStatus = normalizePostStatus(job.status)
    const existing = existingByClipId.get(job.id)

    if (!existing) {
      inserts.push({
        clip_id: job.id,
        channel_id: job.channel_id,
        platform: 'tiktok',
        destination: 'manual',
        video_url: storedVideoUrl,
        source_video_url: job.source_url?.trim() || previewUrl,
        tiktok_url: tiktokUrl,
        hook,
        caption: '',
        hashtags: [],
        score,
        status: mappedStatus,
        comment_count_hint: 0,
        priority_score: score,
        thumbnail_url: thumbnailUrl,
      })
      return
    }

    const patch: Record<string, unknown> = {}

    if (!existing.channel_id) {
      patch.channel_id = job.channel_id
    }

    if (!existing.video_url && directVideoUrl) {
      patch.video_url = directVideoUrl
    }

    if (!existing.source_video_url) {
      patch.source_video_url = job.source_url?.trim() || previewUrl
    }

    if (!existing.hook) {
      patch.hook = hook
    }

    if (!existing.thumbnail_url && thumbnailUrl) {
      patch.thumbnail_url = thumbnailUrl
    }

    if (!existing.tiktok_url && tiktokUrl) {
      patch.tiktok_url = tiktokUrl
    }

    if (normalizePostStatus(existing.status) !== mappedStatus && existing.status === 'ready') {
      patch.status = mappedStatus
    }

    if (toNumber(existing.score) === 0 && score > 0) {
      patch.score = score
    }

    if (toNumber(existing.priority_score) < score) {
      patch.priority_score = score
    }

    if (Object.keys(patch).length > 0) {
      updates.push({ id: existing.id, patch })
    }
  })

  if (inserts.length > 0) {
    const { error } = await supabaseAdmin.from('posts').insert(inserts)
    if (error) {
      throw new Error(error.message)
    }
  }

  if (updates.length > 0) {
    await Promise.all(
      updates.map(async (update) => {
        const { error } = await supabaseAdmin
          .from('posts')
          .update(update.patch)
          .eq('id', update.id)

        if (error) {
          throw new Error(error.message)
        }
      }),
    )
  }
}

export async function getQueueData(session: SessionWithRole): Promise<{
  channels: AppChannel[]
  posts: AppPost[]
  settings: AppUserSettings
}> {
  const [channels, settings] = await Promise.all([
    getAccessibleChannels(session),
    ensureUserSettings(session),
  ])

  await syncLegacyPostsForChannels(session.channelIds)

  if (session.channelIds.length === 0) {
    return {
      channels,
      posts: [],
      settings,
    }
  }

  let { data, error }: { data: unknown[] | null; error: { message: string } | null } = await supabaseAdmin
    .from('posts')
    .select('id, channel_id, clip_url, video_url, source_video_url, tiktok_url, hook, caption, hashtags, score, status, comment_count_hint, priority_score, thumbnail_url, created_at, updated_at')
    .in('channel_id', session.channelIds)
    .order('priority_score', { ascending: false })
    .order('created_at', { ascending: false })

  if (error && error.message.includes('posts.clip_url')) {
    ;({ data, error } = await supabaseAdmin
      .from('posts')
      .select('id, channel_id, video_url, source_video_url, tiktok_url, hook, caption, hashtags, score, status, comment_count_hint, priority_score, thumbnail_url, created_at, updated_at')
      .in('channel_id', session.channelIds)
      .order('priority_score', { ascending: false })
      .order('created_at', { ascending: false }))
  }

  if (error) {
    throw new Error(error.message)
  }

  const channelsById = new Map(channels.map((channel) => [channel.id, channel]))
  const posts = (data ?? [])
    .map((row) => {
      const typedRow = row as PostRow
      const channel = typedRow.channel_id ? channelsById.get(typedRow.channel_id) : null
      return channel ? normalizePost(typedRow, channel) : null
    })
    .filter((post): post is AppPost => Boolean(post))

  return { channels, posts, settings }
}

export async function getPostForSession(
  session: SessionWithRole,
  postId: string,
): Promise<AppPost> {
  const { data, error } = await supabaseAdmin
    .from('posts')
    .select('id, channel_id, clip_url, video_url, tiktok_url, hook, caption, hashtags, score, status, comment_count_hint, priority_score, thumbnail_url, created_at, updated_at')
    .eq('id', postId)
    .single()

  if (error || !data) {
    throw new Error('Post not found.')
  }

  const row = data as PostRow
  if (!row.channel_id || !session.channelIds.includes(row.channel_id)) {
    throw new Error('Forbidden')
  }

  const { data: channelRow, error: channelError } = await supabaseAdmin
    .from('channels')
    .select('id, name, niche, tiktok_profile_url, buffer_profile_id, status')
    .eq('id', row.channel_id)
    .single()

  if (channelError || !channelRow) {
    throw new Error(channelError?.message || 'Channel not found.')
  }

  return normalizePost(row, normalizeChannel(channelRow as ChannelRow))
}

export async function updatePostForSession(
  session: SessionWithRole,
  postId: string,
  patch: Partial<Pick<AppPost, 'hook' | 'caption' | 'status' | 'comment_count_hint'>>,
): Promise<AppPost> {
  const current = await getPostForSession(session, postId)

  const nextPatch: Record<string, unknown> = {}
  if (typeof patch.hook === 'string') {
    nextPatch.hook = patch.hook.trim()
  }
  if (typeof patch.caption === 'string') {
    nextPatch.caption = patch.caption.trim()
  }
  if (typeof patch.status === 'string') {
    nextPatch.status = normalizePostStatus(patch.status)
  }
  if (typeof patch.comment_count_hint === 'number') {
    nextPatch.comment_count_hint = Math.max(0, Math.floor(patch.comment_count_hint))
  }

  if (Object.keys(nextPatch).length === 0) {
    return current
  }

  const { data, error } = await supabaseAdmin
    .from('posts')
    .update(nextPatch)
    .eq('id', postId)
    .select('id, channel_id, clip_url, video_url, tiktok_url, hook, caption, hashtags, score, status, comment_count_hint, priority_score, thumbnail_url, created_at, updated_at')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Unable to update post.')
  }

  return normalizePost(data as PostRow, current.channel)
}

export async function sendToBufferStub(
  session: SessionWithRole,
  postId: string,
): Promise<AppPost> {
  return updatePostForSession(session, postId, { status: 'sent_to_buffer' })
}

export async function createReplySession(
  session: SessionWithRole,
  input: {
    postId: string
    commentText: string
    finalReplyText: string
    generatedSuggestions: string[]
    outcomeType: string
  },
): Promise<{ intelligence: CommentIntelligence; suggestions: string[] }> {
  const post = await getPostForSession(session, input.postId)
  const intelligence = scoreComment(input.commentText)
  const learningContext = await getWorkerLearningContext()
  const suggestions = input.generatedSuggestions.length
    ? input.generatedSuggestions
    : generateReplySuggestions({
        channelName: post.channel.name,
        hook: post.hook,
        commentText: input.commentText,
        intelligence,
        learningContext,
      })

  const { data: replySession, error: replySessionError } = await supabaseAdmin
    .from('reply_sessions')
    .insert({
      post_id: post.id,
      user_id: session.userId,
      comment_text: input.commentText.trim(),
      comment_type: intelligence.type,
      priority_score: intelligence.score,
      generated_suggestions: suggestions,
      final_reply_text: input.finalReplyText.trim(),
    })
    .select('id')
    .single()

  if (replySessionError || !replySession) {
    throw new Error(replySessionError?.message || 'Unable to save reply session.')
  }

  const { error: feedbackError } = await supabaseAdmin
    .from('reply_feedback')
    .insert({
      reply_session_id: replySession.id,
      outcome_type: input.outcomeType,
    })

  if (feedbackError) {
    throw new Error(feedbackError.message)
  }

  try {
    await refreshLearningWeights()
  } catch (error) {
    console.error('Unable to refresh learning weights:', error)
  }

  return { intelligence, suggestions }
}

export async function generateSuggestionsForPost(
  session: SessionWithRole,
  postId: string,
  commentText: string,
): Promise<{ intelligence: CommentIntelligence; suggestions: string[] }> {
  const post = await getPostForSession(session, postId)
  const intelligence = scoreComment(commentText)
  const learningContext = await getWorkerLearningContext()
  const suggestions = generateReplySuggestions({
    channelName: post.channel.name,
    hook: post.hook,
    commentText,
    intelligence,
    learningContext,
  })

  return { intelligence, suggestions }
}

export async function getReplyAnalysis(session: SessionWithRole): Promise<ReplyAnalysis> {
  if (session.channelIds.length === 0) {
    return analyzeReplies([])
  }

  const { data: posts, error: postsError } = await supabaseAdmin
    .from('posts')
    .select('id')
    .in('channel_id', session.channelIds)

  if (postsError) {
    throw new Error(postsError.message)
  }

  const postIds = (posts ?? []).map((post: { id: string }) => post.id)
  if (postIds.length === 0) {
    return analyzeReplies([])
  }

  const { data: sessions, error: sessionsError } = await supabaseAdmin
    .from('reply_sessions')
    .select('comment_type, generated_suggestions, final_reply_text')
    .in('post_id', postIds)

  if (sessionsError) {
    throw new Error(sessionsError.message)
  }

  return analyzeReplies((sessions ?? []) as ReplySessionRow[])
}
