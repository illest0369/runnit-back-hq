import type { RBHQIntelligenceRankLabel, RBHQIntelligenceUrgency, RBHQIntelligenceV1 } from './intelligence-v1'
import type { MacMiniAssetStatus, MacMiniHandoffStatus, MacMiniPackageStatus } from './mac-mini-handoff'
import {
  buildTikTokStagingReadiness,
  type TikTokStagingReadiness,
  type TikTokStagingStatus,
} from './operator-staging'

export type QueueCandidateReadiness = {
  candidateId: string | null
  candidateStatus: string | null
  clipPrepStatus: string | null
  clipPrepConfidence: string | null
  clipPrepReady: boolean
  clipPrep: QueueClipPrepSummary | null
  macMiniPackageId: string | null
  macMiniPackageStatus: MacMiniPackageStatus | null
  macMiniHandoffStatus: MacMiniHandoffStatus | null
  macMiniPackageReady: boolean
  localRenderStatus: MacMiniAssetStatus | null
  localRenderAttached: boolean
  localAssetPath: string | null
  tiktokStaging: TikTokStagingReadiness
}

export type QueueCandidateForReadiness = {
  id: string
  status?: string | null
  hook_text?: string | null
  caption?: string | null
  hashtags?: string[] | null
  score?: number | string | null
  score_breakdown?: Record<string, unknown> | null
  clip_prep?: unknown
  suggested_clip_start_seconds?: number | string | null
  suggested_clip_end_seconds?: number | string | null
  suggested_clip_length_seconds?: number | string | null
  clip_reason?: string | null
  opening_text?: string | null
  edit_notes?: string[] | null
  asset_instructions?: string | null
  clip_prep_status?: string | null
  clip_prep_confidence?: string | null
}

export type QueueClipPrepSummary = {
  status: string | null
  confidence: string | null
  suggestedStartSeconds: number | null
  suggestedEndSeconds: number | null
  suggestedLengthSeconds: number | null
  clipReason: string | null
  openingText: string | null
  editNotes: string[]
  assetInstructions: string | null
  transcriptTimed: boolean | null
}

export type QueuePackageForReadiness = {
  id: string
  lane_label?: string | null
  browser_channel_key?: string | null
  package_status?: MacMiniPackageStatus | null
  handoff_status?: MacMiniHandoffStatus | null
  asset_status?: MacMiniAssetStatus | null
  local_asset_path?: string | null
  dry_run_at?: string | null
  dry_run_result?: Record<string, unknown> | null
  dry_run_error?: string | null
  tiktok_staging_status?: TikTokStagingStatus | null
  tiktok_staging_requested_at?: string | null
  tiktok_staging_at?: string | null
  tiktok_staging_error?: string | null
}

const CANDIDATE_ID_PATTERNS = [
  /Promoted from clip_candidate:([A-Za-z0-9_-]+)/,
  /clip_candidate:([A-Za-z0-9_-]+)/,
]

function compact(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(compact).filter(Boolean)
    : []
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeRankLabel(value: unknown): RBHQIntelligenceRankLabel {
  if (value === 'must_post' || value === 'strong' || value === 'solid' || value === 'low_priority') {
    return value
  }
  return 'low_priority'
}

function normalizeUrgency(value: unknown): RBHQIntelligenceUrgency {
  if (value === 'post_now' || value === 'today' || value === 'evergreen' || value === 'hold') {
    return value
  }
  return 'hold'
}

export function extractCandidateIdFromNotes(notes: string[] | null | undefined): string | null {
  for (const note of notes ?? []) {
    for (const pattern of CANDIDATE_ID_PATTERNS) {
      const match = note.match(pattern)
      if (match?.[1]) return match[1]
    }
  }
  return null
}

export function buildCandidateIntelligenceForQueue(
  candidate: QueueCandidateForReadiness | null | undefined,
): RBHQIntelligenceV1 | null {
  if (!candidate) return null
  const breakdown = candidate.score_breakdown ?? {}
  const score = readNumber(candidate.score ?? breakdown.score)
  const suggestedCaption = compact(breakdown.suggestedCaption) || compact(candidate.caption)
  const suggestedHashtags = readStringArray(breakdown.suggestedHashtags).length > 0
    ? readStringArray(breakdown.suggestedHashtags)
    : readStringArray(candidate.hashtags)

  return {
    score: Math.max(0, Math.min(100, Math.round(score ?? 0))),
    rankLabel: normalizeRankLabel(breakdown.rankLabel),
    urgency: normalizeUrgency(breakdown.urgency),
    reasons: readStringArray(breakdown.reasons).slice(0, 6),
    suggestedCaption,
    suggestedHashtags,
    hook: compact(candidate.hook_text),
    operatorSummary: compact(breakdown.operatorSummary),
    whyNow: compact(breakdown.whyNow),
  }
}

export function buildQueueReadiness(
  candidateId: string | null,
  candidate: QueueCandidateForReadiness | null | undefined,
  pkg: QueuePackageForReadiness | null | undefined,
): QueueCandidateReadiness {
  const clipPrepStatus = candidate?.clip_prep_status ?? null
  const packageStatus = pkg?.package_status ?? null
  const handoffStatus = pkg?.handoff_status ?? null
  const assetStatus = pkg?.asset_status ?? null
  const localAssetPath = pkg?.local_asset_path ?? null

  return {
    candidateId,
    candidateStatus: candidate?.status ?? null,
    clipPrepStatus,
    clipPrepConfidence: candidate?.clip_prep_confidence ?? null,
    clipPrepReady: clipPrepStatus === 'ready',
    clipPrep: readClipPrepSummary(candidate),
    macMiniPackageId: pkg?.id ?? null,
    macMiniPackageStatus: packageStatus,
    macMiniHandoffStatus: handoffStatus,
    macMiniPackageReady: packageStatus === 'ready' && handoffStatus === 'pending',
    localRenderStatus: assetStatus,
    localRenderAttached: assetStatus === 'attached' && Boolean(localAssetPath),
    localAssetPath,
    tiktokStaging: buildTikTokStagingReadiness(candidateId, {
      candidateStatus: candidate?.status ?? null,
      clipPrepStatus,
    }, pkg),
  }
}

function readClipPrepSummary(
  candidate: QueueCandidateForReadiness | null | undefined,
): QueueClipPrepSummary | null {
  if (!candidate) return null
  const embedded = readObject(candidate.clip_prep) ?? readObject(candidate.score_breakdown?.clipPrep)
  const basis = readObject(embedded?.basis)
  const start = readNumber(embedded?.suggested_clip_start_seconds ?? candidate.suggested_clip_start_seconds)
  const end = readNumber(embedded?.suggested_clip_end_seconds ?? candidate.suggested_clip_end_seconds)
  const length = readNumber(embedded?.suggested_clip_length_seconds ?? candidate.suggested_clip_length_seconds)
  const status = compact(embedded?.status) || compact(candidate.clip_prep_status) || null
  const confidence = compact(embedded?.confidence) || compact(candidate.clip_prep_confidence) || null
  const clipReason = compact(embedded?.clip_reason) || compact(candidate.clip_reason) || null
  const openingText = compact(embedded?.opening_text) || compact(candidate.opening_text) || null
  const assetInstructions = compact(embedded?.asset_instructions) || compact(candidate.asset_instructions) || null
  const editNotes = readStringArray(embedded?.edit_notes).length > 0
    ? readStringArray(embedded?.edit_notes)
    : readStringArray(candidate.edit_notes)
  const transcriptTimed = typeof basis?.timed_transcript_available === 'boolean'
    ? basis.timed_transcript_available
    : null

  if (!status && !confidence && start === null && end === null && !clipReason && !openingText && editNotes.length === 0) {
    return null
  }

  return {
    status,
    confidence,
    suggestedStartSeconds: start,
    suggestedEndSeconds: end,
    suggestedLengthSeconds: length,
    clipReason,
    openingText,
    editNotes,
    assetInstructions,
    transcriptTimed,
  }
}
