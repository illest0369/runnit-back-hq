import type { SupabaseClient } from '@supabase/supabase-js'

type ClipCandidateRow = {
  id: string
  ingested_video_id: string
  target_channel_id: string | null
  start_seconds: number | string | null
  end_seconds: number | string | null
  title: string
  summary: string | null
  hook_text: string | null
  caption: string | null
  hashtags: string[] | null
  score: number | string | null
  score_breakdown: Record<string, unknown> | null
  status: string
}

type IngestedVideoRow = {
  id: string
  source_channel_id: string | null
  external_video_id: string
  platform: string
  title: string
  description: string | null
  video_url: string
  thumbnail_url: string | null
  duration_seconds: number | string | null
}

type SourceChannelRow = {
  id: string
  channel_key: string
  display_name: string
  target_rbhq_channel_id: string | null
}

type PromotedClipRow = {
  id: string
  channel_id: string | null
  status: string
  publish_status: string
  external_id: string | null
  title: string
  source_url: string | null
  video_url: string | null
  moderation_notes: unknown
  risk_flags: unknown
}

export type CandidatePromotionResult = {
  candidateId: string
  promotedClipId: string
  reviewStatus: string
  publishStatus: string
  channelId: string
}

function readNumber(value: number | string | null): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readScore(value: number | string | null): number {
  const parsed = readNumber(value)
  return parsed === null ? 50 : Math.max(0, Math.min(100, Math.round(parsed)))
}

function compact(value: string | null | undefined, maxLength: number): string {
  const clean = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 3).trim()}...`
}

function stringArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item) => item.trim()) : []
}

function externalIdFor(candidate: ClipCandidateRow, video: IngestedVideoRow): string {
  return `clip_candidate:${candidate.id}:video:${video.external_video_id}`
}

export async function promoteClipCandidateToReview(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<CandidatePromotionResult> {
  const { data: candidateData, error: candidateError } = await supabase
    .from('clip_candidates')
    .select('id, ingested_video_id, target_channel_id, start_seconds, end_seconds, title, summary, hook_text, caption, hashtags, score, score_breakdown, status')
    .eq('id', candidateId)
    .single()

  if (candidateError || !candidateData) {
    throw new Error(candidateError?.message || 'Clip candidate not found.')
  }

  const candidate = candidateData as ClipCandidateRow
  if (candidate.status !== 'candidate' && candidate.status !== 'approved_for_review') {
    throw new Error(`Candidate status ${candidate.status} cannot be promoted.`)
  }

  const startSeconds = readNumber(candidate.start_seconds)
  const endSeconds = readNumber(candidate.end_seconds)
  if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) {
    throw new Error('Candidate promotion requires real timed transcript start_seconds/end_seconds.')
  }

  const { data: videoData, error: videoError } = await supabase
    .from('ingested_videos')
    .select('id, source_channel_id, external_video_id, platform, title, description, video_url, thumbnail_url, duration_seconds')
    .eq('id', candidate.ingested_video_id)
    .single()

  if (videoError || !videoData) {
    throw new Error(videoError?.message || 'Ingested video not found.')
  }

  const video = videoData as IngestedVideoRow
  let source: SourceChannelRow | null = null
  if (video.source_channel_id) {
    const { data: sourceData, error: sourceError } = await supabase
      .from('source_channels')
      .select('id, channel_key, display_name, target_rbhq_channel_id')
      .eq('id', video.source_channel_id)
      .maybeSingle()
    if (sourceError) throw new Error(sourceError.message)
    source = sourceData as SourceChannelRow | null
  }

  const channelId = candidate.target_channel_id ?? source?.target_rbhq_channel_id ?? null
  if (!channelId) {
    throw new Error('Candidate promotion requires target_channel_id or source target_rbhq_channel_id.')
  }

  if (!video.video_url?.trim()) {
    throw new Error('Candidate promotion requires an ingested source video URL.')
  }

  if (!video.thumbnail_url?.trim()) {
    throw new Error('Candidate promotion requires a thumbnail URL for review.')
  }

  const now = new Date().toISOString()
  const durationSeconds = Math.max(1, Math.round(endSeconds - startSeconds))
  const score = readScore(candidate.score)
  const sourceName = source?.display_name || 'TikTok Candidate Scout'
  const externalId = externalIdFor(candidate, video)
  const hook = compact(candidate.hook_text || candidate.title, 74) || compact(video.title, 74)

  const { data: insertedClip, error: insertError } = await supabase
    .from('clips')
    .insert({
      channel_id: channelId,
      external_id: externalId,
      title: candidate.title || video.title,
      hook,
      source_name: sourceName,
      source_type: 'youtube',
      thumbnail_url: video.thumbnail_url,
      video_url: video.video_url,
      source_url: video.video_url,
      original_platform: video.platform || 'youtube',
      import_batch_id: `candidate-promotion:${now.slice(0, 10)}`,
      aspect_ratio: '9:16',
      duration_seconds: durationSeconds,
      ai_score: score,
      virality_score: score,
      hook_strength: score,
      sports_category: 'tiktok_candidate',
      recommended_hook: candidate.hook_text || candidate.title,
      moderation_notes: [
        `Promoted from clip_candidate:${candidate.id}`,
        `candidate_start_seconds:${startSeconds}`,
        `candidate_end_seconds:${endSeconds}`,
        `candidate_caption:${candidate.caption ?? ''}`,
        `candidate_hashtags:${stringArray(candidate.hashtags).join(' ')}`,
        'Manual approval required before render/export/n8n handoff.',
      ],
      risk_flags: ['needs_clip_render', 'candidate_promoted_for_review'],
      status: 'pending',
      publish_status: 'not_ready',
      ingested_at: now,
      ingestion_status: 'imported',
      created_at: now,
      updated_at: now,
    })
    .select('id, channel_id, status, publish_status, external_id, title, source_url, video_url, moderation_notes, risk_flags')
    .single()

  if (insertError || !insertedClip) {
    throw new Error(insertError?.message || 'Promoted review clip could not be inserted.')
  }

  const clip = insertedClip as PromotedClipRow
  const { error: updateError } = await supabase
    .from('clip_candidates')
    .update({
      status: 'promoted',
      score_breakdown: {
        ...(candidate.score_breakdown ?? {}),
        promotedClipId: clip.id,
        promotedAt: now,
        promotionTarget: 'clips.pending_review',
      },
      updated_at: now,
    })
    .eq('id', candidate.id)

  if (updateError) {
    await supabase.from('clips').delete().eq('id', clip.id)
    throw new Error(updateError.message)
  }

  return {
    candidateId: candidate.id,
    promotedClipId: clip.id,
    reviewStatus: clip.status,
    publishStatus: clip.publish_status,
    channelId,
  }
}
