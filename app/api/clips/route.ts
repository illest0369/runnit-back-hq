export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'
import { getClips, getNextPendingClip } from '@/lib/moderation-queue'
import { getRBHQIntelligenceV1 } from '@/lib/intelligence-v1'
import {
  buildCandidateIntelligenceForQueue,
  buildQueueReadiness,
  extractCandidateIdFromNotes,
  type QueueCandidateForReadiness,
  type QueuePackageForReadiness,
} from '@/lib/operator-queue-readiness'
import { supabaseAdmin } from '@/lib/supabase'
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
  const urgency = readUrgency(searchParams.get('urgency'))
  const minScore = readMinScore(searchParams.get('min_score'))

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
    const data = await toReviewClips(nextClip ? [nextClip] : [], { urgency, minScore })

    return NextResponse.json({
      ok: true,
      data,
    })
  }

  const clips = await getClips({ limit, channelIds: [channelId], sourceName, status, minScore })
  const data = await toReviewClips(clips, { urgency, minScore })

  return NextResponse.json({
    ok: true,
    data,
  })
}

type ReviewClip = Awaited<ReturnType<typeof getClips>>[number]

type QueueCandidateRow = QueueCandidateForReadiness & {
  title?: string | null
}

async function loadCandidateState(clips: ReviewClip[]): Promise<{
  candidates: Map<string, QueueCandidateRow>
  packages: Map<string, QueuePackageForReadiness>
}> {
  const candidateIds = [...new Set(clips.map((clip) => extractCandidateIdFromNotes(clip.moderation_notes)).filter((id): id is string => Boolean(id)))]
  if (candidateIds.length === 0) {
    return { candidates: new Map(), packages: new Map() }
  }

  const [{ data: candidates, error: candidateError }, { data: packages, error: packageError }] = await Promise.all([
    supabaseAdmin
      .from('clip_candidates')
      .select('id, title, status, hook_text, caption, hashtags, score, score_breakdown, clip_prep_status, clip_prep_confidence')
      .in('id', candidateIds),
    supabaseAdmin
      .from('mac_mini_clip_packages')
      .select(
        `id, clip_candidate_id, lane_label, browser_channel_key, package_status, handoff_status, asset_status, local_asset_path,
         dry_run_at, dry_run_result, dry_run_error, tiktok_staging_status, tiktok_staging_requested_at, tiktok_staging_at, tiktok_staging_error`,
      )
      .in('clip_candidate_id', candidateIds),
  ])

  if (candidateError) throw new Error(candidateError.message)
  if (packageError) throw new Error(packageError.message)

  return {
    candidates: new Map(((candidates ?? []) as QueueCandidateRow[]).map((candidate) => [candidate.id, candidate])),
    packages: new Map(
      ((packages ?? []) as Array<QueuePackageForReadiness & { clip_candidate_id: string }>)
        .map((pkg) => [pkg.clip_candidate_id, pkg]),
    ),
  }
}

async function toReviewClips(
  clips: ReviewClip[],
  filters: { urgency: ReturnType<typeof readUrgency>; minScore: number | null },
) {
  const state = await loadCandidateState(clips)
  return clips
    .map((clip) => toReviewClip(clip, state))
    .filter((clip) => !filters.urgency || clip.intelligence_v1.urgency === filters.urgency)
    .filter((clip) => filters.minScore === null || clip.intelligence_v1.score >= filters.minScore)
}

function toReviewClip(
  clip: ReviewClip,
  state: {
    candidates: Map<string, QueueCandidateRow>
    packages: Map<string, QueuePackageForReadiness>
  },
) {
  const analysis = getStoredTikTokAnalysis(clip.moderation_notes)
  const candidateId = extractCandidateIdFromNotes(clip.moderation_notes)
  const candidate = candidateId ? state.candidates.get(candidateId) ?? null : null
  const candidateIntelligence = buildCandidateIntelligenceForQueue(candidate)
  const intelligence = candidateIntelligence ?? getRBHQIntelligenceV1({ ...clip, analyzer: analysis })
  const vertical = getTikTokVerticalReadiness(clip)
  const packageReadiness = buildQueueReadiness(
    candidateId,
    candidate,
    candidateId ? state.packages.get(candidateId) ?? null : null,
  )

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
    source_url: clip.source_url,
    source_name: clip.source_name,
    source_type: clip.source_type,
    source: {
      name: clip.source_name,
      type: clip.source_type,
      url: clip.source_url,
      channel_id: clip.channel_id,
      external_id: clip.external_id,
      original_platform: clip.original_platform,
      import_batch_id: clip.import_batch_id,
    },
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
    package_readiness: packageReadiness,
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

function readUrgency(value: string | null) {
  if (value === 'post_now' || value === 'today' || value === 'evergreen' || value === 'hold') {
    return value
  }
  return null
}

function readMinScore(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function labelForScore(score: number): 'flop' | 'decent' | 'strong' | 'hit' {
  if (score >= 90) return 'hit'
  if (score >= 78) return 'strong'
  if (score >= 65) return 'decent'
  return 'flop'
}
