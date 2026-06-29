import { randomUUID } from 'node:crypto'

import { supabaseAdminClient } from './supabase-admin'
import type { PostRecommendation } from './runnitback'

type SaveGeneratedPostInput = {
  channelId: string
  requestedByUserId: string
  sourceSuggestionId?: string | null
  sourceVideoUrl: string
  title: string
  publicClipUrl: string
  cdnUrl: string | null
  localUrl: string | null
  score: number
  hook: string
  hookOptions: string[]
  caption: string
  hashtags: string[]
  riskNotes: string[]
  recommendation: PostRecommendation
  viralReasoning: string[]
  commentBait: { pinned: string; replyStarter: string } | null
  replyType: string | null
  startTime: number
  endTime: number
  transcriptExcerpt: string
}

function isMissingSchemaObjectError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? ''

  return (
    message.includes('Could not find the') ||
    message.includes('schema cache') ||
    message.includes('column')
  )
}

export async function getSourceSuggestion(suggestionId: string): Promise<{
  id: string
  source_title: string
  initial_score: number
} | null> {
  const { data, error } = await supabaseAdminClient
    .from('source_suggestions')
    .select('id, source_title, initial_score')
    .eq('id', suggestionId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function updateSourceSuggestionStatus(
  suggestionId: string | null | undefined,
  status: 'suggested' | 'processing' | 'ready' | 'failed',
) {
  if (!suggestionId) {
    return
  }

  const { error } = await supabaseAdminClient
    .from('source_suggestions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', suggestionId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function saveGeneratedClipRecord(input: SaveGeneratedPostInput): Promise<{
  queueJobId: string
  postId: string
}> {
  const queueJobId = randomUUID()
  const postId = randomUUID()
  const createdAt = new Date().toISOString()
  const postPackage = {
    title: input.title,
    hook: input.hook,
    hook_options: input.hookOptions,
    caption: input.caption,
    hashtags: input.hashtags,
    risk_notes: input.riskNotes,
    recommendation: input.recommendation,
    viral_reasoning: input.viralReasoning,
    comment_bait: input.commentBait,
    transcript_excerpt: input.transcriptExcerpt,
    source_video_url: input.sourceVideoUrl,
    start_time: input.startTime,
    end_time: input.endTime,
    reply_type: input.replyType,
  }

  const { error: queueError } = await supabaseAdminClient.from('queue_jobs').insert({
    id: queueJobId,
    channel_id: input.channelId,
    user_id: null,
    source_url: input.sourceVideoUrl,
    clip_url: input.publicClipUrl,
    score: input.score,
    status: 'ready',
    post_package: postPackage,
    created_at: createdAt,
  })

  if (queueError) {
    throw new Error(queueError.message)
  }

  const postPayload = {
    id: postId,
    clip_id: queueJobId,
    channel_id: input.channelId,
    source_suggestion_id: input.sourceSuggestionId ?? null,
    platform: 'tiktok',
    destination: 'manual',
    video_url: input.publicClipUrl,
    cdn_url: input.cdnUrl,
    local_url: input.localUrl,
    tiktok_url: null,
    source_video_url: input.sourceVideoUrl,
    hook: input.hook,
    hook_options: input.hookOptions,
    caption: input.caption,
    hashtags: input.hashtags,
    score: input.score,
    status: 'queued',
    comment_count_hint: 0,
    priority_score: input.score,
    thumbnail_url: null,
    review_status: 'needs_review',
    start_time: input.startTime,
    end_time: input.endTime,
    viral_reasoning: input.viralReasoning,
    risk_notes: input.riskNotes,
    recommendation: input.recommendation,
    comment_bait: input.commentBait,
    reply_type: input.replyType,
    created_at: createdAt,
    updated_at: createdAt,
  }

  let { error: postError } = await supabaseAdminClient.from('posts').insert(postPayload)

  if (postError && isMissingSchemaObjectError(postError)) {
    ;({ error: postError } = await supabaseAdminClient.from('posts').insert({
      id: postPayload.id,
      clip_id: postPayload.clip_id,
      channel_id: postPayload.channel_id,
      platform: postPayload.platform,
      destination: 'manual',
      caption: postPayload.caption,
      video_url: postPayload.video_url,
      source_video_url: postPayload.source_video_url,
      hook: postPayload.hook,
      hook_options: postPayload.hook_options,
      hashtags: postPayload.hashtags,
      score: postPayload.score,
      status: 'queued',
      comment_count_hint: postPayload.comment_count_hint,
      priority_score: postPayload.priority_score,
      thumbnail_url: postPayload.thumbnail_url,
      review_status: postPayload.review_status,
      start_time: postPayload.start_time,
      end_time: postPayload.end_time,
      comment_bait: postPayload.comment_bait,
      reply_type: postPayload.reply_type,
      created_at: postPayload.created_at,
      updated_at: postPayload.updated_at,
    }))
  }

  if (postError) {
    await supabaseAdminClient.from('queue_jobs').delete().eq('id', queueJobId)
    throw new Error(postError.message)
  }

  return { queueJobId, postId }
}

export async function updateProcessedVideoStatus(videoUrl: string, status: 'processed' | 'failed') {
  const { error } = await supabaseAdminClient
    .from('processed_videos')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('video_url', videoUrl)

  if (error) {
    if (isMissingSchemaObjectError(error)) {
      console.warn('[db] processed_videos status skipped:', error.message)
      return
    }

    throw new Error(error.message)
  }
}
