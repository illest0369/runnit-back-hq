export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'
import { getClips, getNextPendingClip } from '@/lib/moderation-queue'
import { getRBHQIntelligenceV1 } from '@/lib/intelligence-v1'
import { getStoredTikTokAnalysis, getTikTokVerticalReadiness } from '@/lib/tiktok-analyzer'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const channelId = searchParams.get('channel_id')
  const limit = Math.min(60, Math.max(1, Number(searchParams.get('limit') ?? 60) || 60))
  const sourceName = searchParams.get('source_name')
  const nextAfter = searchParams.get('next_after')
  const statusParam = searchParams.get('status')
  const status = statusParam === 'held' || statusParam === 'skipped' ? 'skipped' : 'pending'

  if (!channelId) {
    return NextResponse.json({ ok: false, error: 'channel_id required' }, { status: 400 })
  }

  if (!session.channelIds.includes(channelId)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  if (nextAfter) {
    const nextClip = await getNextPendingClip({
      channelIds: [channelId],
      excludeId: nextAfter,
      sourceName,
    })

    return NextResponse.json({
      ok: true,
      data: nextClip ? [toReviewClip(nextClip)] : [],
    })
  }

  const clips = await getClips({ limit, channelIds: [channelId], sourceName, status })

  return NextResponse.json({
    ok: true,
    data: clips.map(toReviewClip),
  })
}

function toReviewClip(clip: Awaited<ReturnType<typeof getClips>>[number]) {
  const analysis = getStoredTikTokAnalysis(clip.moderation_notes)
  const intelligence = getRBHQIntelligenceV1({ ...clip, analyzer: analysis })
  const vertical = getTikTokVerticalReadiness(clip)

  return {
    id: clip.id,
    hook: clip.hook || clip.title,
    title: clip.title,
    score: clip.ai_score,
    performance_score: clip.ai_score,
    performance_label: labelForScore(clip.ai_score),
    feedback_vote: null,
    review_status: clip.status,
    channel_id: clip.channel_id,
    thumbnail_url: clip.thumbnail_url,
    cdn_url: clip.video_url,
    local_url: null,
    video_url: clip.video_url,
    tiktok_url: null,
    source_video_url: clip.video_url,
    source_name: clip.source_name,
    source_type: clip.source_type,
    sport: clip.sport,
    league: clip.league,
    virality_score: clip.virality_score,
    hook_strength: clip.hook_strength,
    emotion: clip.emotion,
    sports_category: clip.sports_category,
    recommended_hook: clip.recommended_hook,
    risk_flags: clip.risk_flags,
    moderation_notes: clip.moderation_notes,
    tiktok_analysis: analysis,
    intelligence_v1: intelligence,
    vertical_readiness: vertical,
    gemini_processed_at: clip.gemini_processed_at,
    duration_seconds: clip.duration_seconds,
    aspect_ratio: clip.aspect_ratio,
    publish_status: clip.publish_status,
    approved_at: clip.approved_at,
    manually_published_at: clip.manually_published_at,
    created_at: clip.created_at,
    updated_at: clip.updated_at,
  }
}

function labelForScore(score: number): 'flop' | 'decent' | 'strong' | 'hit' {
  if (score >= 90) return 'hit'
  if (score >= 78) return 'strong'
  if (score >= 65) return 'decent'
  return 'flop'
}
