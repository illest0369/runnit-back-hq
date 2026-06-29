import { hasMetricoolConfigForChannel, sendClipToMetricool } from './metricool'
import { updateClipMetricoolStatus } from './moderation-queue'
import { supabaseAdminClient as supabaseAdmin } from './supabase-admin'

const CLIP_SELECT =
  'id, channel_id, source_id, external_id, title, hook, source_name, source_type, thumbnail_url, video_url, source_url, original_platform, import_batch_id, aspect_ratio, duration_seconds, ai_score, virality_score, hook_strength, emotion, sports_category, recommended_hook, moderation_notes, risk_flags, gemini_processed_at, sport, league, status, publish_status, approved_at, manually_published_at, created_at, updated_at'

type RenderableClip = {
  id: string
  channel_id: string | null
  title: string
  hook: string
  recommended_hook: string | null
  source_name: string
  sport: string | null
  league: string | null
  video_url: string
  thumbnail_url: string | null
  moderation_notes: string[]
  approved_at: string | null
  manually_published_at?: string | null
  updated_at: string
  status: string
  publish_status: string
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  if (typeof value === 'string') {
    try {
      return normalizeStringArray(JSON.parse(value))
    } catch {
      return []
    }
  }

  return []
}

function toRenderableClip(row: Record<string, unknown>): RenderableClip {
  return {
    id: String(row.id),
    channel_id: typeof row.channel_id === 'string' ? row.channel_id : null,
    title: typeof row.title === 'string' ? row.title : '',
    hook: typeof row.hook === 'string' ? row.hook : '',
    recommended_hook: typeof row.recommended_hook === 'string' ? row.recommended_hook : null,
    source_name: typeof row.source_name === 'string' ? row.source_name : '',
    sport: typeof row.sport === 'string' ? row.sport : null,
    league: typeof row.league === 'string' ? row.league : null,
    video_url: typeof row.video_url === 'string' ? row.video_url : '',
    thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null,
    moderation_notes: normalizeStringArray(row.moderation_notes),
    approved_at: typeof row.approved_at === 'string' ? row.approved_at : null,
    manually_published_at: typeof row.manually_published_at === 'string' ? row.manually_published_at : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    status: typeof row.status === 'string' ? row.status : '',
    publish_status: typeof row.publish_status === 'string' ? row.publish_status : '',
  }
}

export async function markModerationClipRenderFailed(
  clipId: string | null | undefined,
  reason: string,
) {
  if (!clipId) return

  const { error } = await supabaseAdmin
    .from('clips')
    .update({
      publish_status: 'render_failed',
      analytics: { render_error: reason, render_failed_at: new Date().toISOString() },
    })
    .eq('id', clipId)

  if (error) {
    console.warn('[clip-render] failed to mark render_failed:', error.message)
  }
}

export async function completeModerationClipRender(input: {
  clipId: string | null | undefined
  publicClipUrl: string
}) {
  if (!input.clipId) return null

  let { data, error } = await supabaseAdmin
    .from('clips')
    .update({
      video_url: input.publicClipUrl,
      publish_status: 'metricool_ready_manual_export',
    })
    .eq('id', input.clipId)
    .select(CLIP_SELECT)
    .maybeSingle()

  if (error?.message.toLowerCase().includes('clips_publish_status_check')) {
    ;({ data, error } = await supabaseAdmin
      .from('clips')
      .update({
        video_url: input.publicClipUrl,
        publish_status: 'ready_for_manual_publish',
      })
      .eq('id', input.clipId)
      .select(CLIP_SELECT)
      .maybeSingle())
  }

  if (error) {
    throw new Error(error.message)
  }

  if (!data) return null
  const clip = toRenderableClip(data as Record<string, unknown>)

  if (!hasMetricoolConfigForChannel(clip.channel_id)) {
    return { clip, metricool: null }
  }

  const metricool = await sendClipToMetricool(clip)
  if (
    metricool.publishStatus === 'metricool_scheduled' ||
    metricool.publishStatus === 'metricool_published' ||
    metricool.publishStatus === 'metricool_failed'
  ) {
    const updated = await updateClipMetricoolStatus(clip.id, {
      publishStatus: metricool.publishStatus,
      metricoolPostId: metricool.metricoolPostId,
    })

    if (updated) {
      return { clip: updated, metricool }
    }
  }

  return { clip: { ...clip, publish_status: metricool.publishStatus }, metricool }
}
