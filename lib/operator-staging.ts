import type { MacMiniAssetStatus, MacMiniHandoffStatus, MacMiniPackageStatus } from './mac-mini-handoff'
import {
  RB_COMBAT_CHANNEL_ID,
  RB_COMBAT_PHASE1_SOURCES,
  rbCombatPhase1SourceForKey,
} from './rb-combat-source-config'

export type TikTokStagingStatus =
  | 'not_requested'
  | 'requested'
  | 'ready_for_manual_post'
  | 'blocked'
  | 'failed'

export type TikTokSessionReadiness = 'ready' | 'missing' | 'unknown'

export type TikTokStagingOperatorState =
  | 'not_ready'
  | 'ready_to_stage'
  | 'ready_for_tiktok_retry'
  | 'staging_requested'
  | 'tiktok_login_blocked'
  | 'dry_run_failed'
  | 'ready_for_manual_post'

export type TikTokStagingReadiness = {
  laneLabel: string | null
  channelKey: string | null
  packageId: string | null
  status: TikTokStagingStatus
  operatorState: TikTokStagingOperatorState
  eligible: boolean
  readyForManualPost: boolean
  readyForTikTokRetry: boolean
  loginBlocked: boolean
  prepCanContinue: boolean
  retryAfterAccessRestored: boolean
  blocker: string | null
  requestedAt: string | null
  stagedAt: string | null
  attachedAssetStatus: MacMiniAssetStatus | null
  tikTokSession: TikTokSessionReadiness
  videoStaged: boolean
  captionFilled: boolean
  screenshotPath: string | null
  error: string | null
}

export type QueueStagingCandidate = {
  candidateStatus?: string | null
  clipPrepStatus?: string | null
  targetChannelId?: string | null
  scoreBreakdown?: Record<string, unknown> | null
  clipPrep?: unknown
  suggestedClipStartSeconds?: number | string | null
  suggestedClipEndSeconds?: number | string | null
  suggestedClipLengthSeconds?: number | string | null
}

export type QueueStagingPackage = {
  id?: string | null
  lane_label?: string | null
  browser_channel_key?: string | null
  package_status?: MacMiniPackageStatus | null
  handoff_status?: MacMiniHandoffStatus | null
  asset_status?: MacMiniAssetStatus | null
  local_asset_path?: string | null
  dry_run_at?: string | null
  dry_run_error?: string | null
  dry_run_result?: Record<string, unknown> | null
  package_payload?: Record<string, unknown> | null
  tiktok_staging_status?: TikTokStagingStatus | null
  tiktok_staging_requested_at?: string | null
  tiktok_staging_at?: string | null
  tiktok_staging_error?: string | null
}

const APPROVED_CANDIDATE_STATUSES = new Set([
  'approved',
  'approved_for_review',
  'approved_for_handoff',
  'promoted',
])

const RB_COMBAT_MANUAL_SHORT_ANGLES = new Set([
  'knockout proof',
  'submission proof',
  'callout',
  'stare-down heat',
  'weigh-in drama',
  'judging controversy',
  'title fight stakes',
  'post-fight reaction',
])

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function compact(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim() : null
}

function boolValue(value: unknown): boolean {
  return value === true
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function selectedClipRange(candidate: QueueStagingCandidate | null | undefined): {
  start: number | null
  end: number | null
  length: number | null
} {
  const start = readNumber(candidate?.suggestedClipStartSeconds)
  const end = readNumber(candidate?.suggestedClipEndSeconds)
  const explicitLength = readNumber(candidate?.suggestedClipLengthSeconds)
  const length = explicitLength ?? (start !== null && end !== null && end > start
    ? Number((end - start).toFixed(3))
    : null)
  return { start, end, length }
}

function hasSelectedClipRange(candidate: QueueStagingCandidate | null | undefined): boolean {
  const range = selectedClipRange(candidate)
  return range.start !== null && range.end !== null && range.end > range.start
}

function readUploaderResult(result: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!result) return {}
  const nested = objectValue(result.uploaderResult)
  return Object.keys(nested).length > 0 ? nested : result
}

function readScreenshotPath(uploaderResult: Record<string, unknown>): string | null {
  const artifacts = objectValue(uploaderResult.artifacts)
  return compact(artifacts.stagedUploadScreenshot) ?? compact(artifacts.uploadPageScreenshot)
}

function readSessionReadiness(uploaderResult: Record<string, unknown>, blocker: string | null): TikTokSessionReadiness {
  if (blocker === 'TIKTOK_LOGIN_REQUIRED') return 'missing'
  if (boolValue(uploaderResult.logged_in)) return 'ready'
  const readiness = objectValue(uploaderResult.readiness)
  if (boolValue(readiness.hasSessionCookies) && !boolValue(readiness.loginRequired)) return 'ready'
  if (boolValue(readiness.loginRequired)) return 'missing'
  return 'unknown'
}

function normalizeStatus(value: unknown): TikTokStagingStatus {
  if (
    value === 'requested' ||
    value === 'ready_for_manual_post' ||
    value === 'blocked' ||
    value === 'failed'
  ) {
    return value
  }
  return 'not_requested'
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => compact(item)).filter((item): item is string => Boolean(item))
    : []
}

function readCaptionPrep(candidate: QueueStagingCandidate | null | undefined, pkg: QueueStagingPackage | null | undefined): Record<string, unknown> {
  const packagePayload = objectValue(pkg?.package_payload)
  const packageClipPrep = objectValue(packagePayload.clipPrep)
  const candidateClipPrep = objectValue(candidate?.clipPrep)
  return objectValue(packagePayload.captionPrep).version === 'rbhq-caption-prep-v1'
    ? objectValue(packagePayload.captionPrep)
    : objectValue(packageClipPrep.caption_prep).version === 'rbhq-caption-prep-v1'
      ? objectValue(packageClipPrep.caption_prep)
      : objectValue(candidateClipPrep.caption_prep).version === 'rbhq-caption-prep-v1'
        ? objectValue(candidateClipPrep.caption_prep)
        : {}
}

function readRBCombatScoutLabel(candidate: QueueStagingCandidate | null | undefined): string | null {
  const breakdown = objectValue(candidate?.scoreBreakdown)
  const rbCombat = objectValue(breakdown.rbCombat)
  const explicit = compact(rbCombat.scoutLabel)
  if (explicit) return explicit
  const urgency = compact(breakdown.urgency)
  const rankLabel = compact(breakdown.rankLabel)
  if (urgency === 'post_now' && (rankLabel === 'must_post' || !rankLabel)) return 'post_now'
  return urgency || null
}

function readRBCombatAngle(candidate: QueueStagingCandidate | null | undefined): string | null {
  const breakdown = objectValue(candidate?.scoreBreakdown)
  const rbCombat = objectValue(breakdown.rbCombat)
  const explicit = compact(rbCombat.rbAngle)
  if (explicit && RB_COMBAT_MANUAL_SHORT_ANGLES.has(explicit)) return explicit

  const clipPrep = objectValue(candidate?.clipPrep)
  const text = [
    explicit,
    compact(breakdown.whyNow),
    compact(breakdown.operatorSummary),
    compact(clipPrep.clip_reason),
    ...stringArray(breakdown.reasons),
  ].join(' ').toLowerCase()
  return [...RB_COMBAT_MANUAL_SHORT_ANGLES].find((angle) => text.includes(angle)) ?? null
}

function rbCombatSourceActive(pkg: QueueStagingPackage | null | undefined): boolean {
  const packagePayload = objectValue(pkg?.package_payload)
  const sourcePayload = objectValue(packagePayload.source)
  const sourceName = compact(sourcePayload.key) ?? compact(sourcePayload.channelKey) ?? compact(sourcePayload.name)
  const source = rbCombatPhase1SourceForKey(sourceName) ??
    RB_COMBAT_PHASE1_SOURCES.find((item) => item.displayName.toLowerCase() === sourceName?.toLowerCase())
  return source?.active === true
}

function transcriptMissingWithoutBurnClaim(candidate: QueueStagingCandidate | null | undefined, pkg: QueueStagingPackage | null | undefined): boolean {
  const clipPrep = objectValue(candidate?.clipPrep)
  const basis = objectValue(clipPrep.basis)
  const captionPrep = readCaptionPrep(candidate, pkg)
  const subtitleSource = compact(captionPrep.subtitle_source)
  const style = objectValue(captionPrep.suggested_subtitle_style)
  const safety = objectValue(captionPrep.safety)
  const transcriptUnavailable = subtitleSource === 'metadata_only' ||
    subtitleSource === 'unavailable' ||
    basis.timed_transcript_available === false ||
    basis.transcript_available === false
  const burnedSubtitlesClaimed = style.burned_in === true || safety.burned_in === true
  return transcriptUnavailable && !burnedSubtitlesClaimed
}

function rbCombatManualShortRenderable(input: {
  candidate: QueueStagingCandidate | null | undefined
  pkg: QueueStagingPackage | null | undefined
  localRenderAttached: boolean
}): boolean {
  const { candidate, pkg } = input
  const rbCombatLane = pkg?.browser_channel_key === 'rb_combat' ||
    pkg?.lane_label === 'RB Combat' ||
    candidate?.targetChannelId === RB_COMBAT_CHANNEL_ID
  if (!rbCombatLane) return false
  if (candidate?.clipPrepStatus !== 'metadata_only') return false
  if (!input.localRenderAttached) return false
  if (!rbCombatSourceActive(pkg)) return false
  if (readRBCombatScoutLabel(candidate) !== 'post_now') return false
  if (!readRBCombatAngle(candidate)) return false
  const range = selectedClipRange(candidate)
  if (range.start === null || range.end === null || range.end <= range.start) return false
  if (range.length === null || range.length < 8 || range.length > 45) return false
  return transcriptMissingWithoutBurnClaim(candidate, pkg)
}

function operatorStateFor(input: {
  readyForManualPost: boolean
  readyForTikTokRetry: boolean
  loginBlocked: boolean
  status: TikTokStagingStatus
  eligible: boolean
}): TikTokStagingOperatorState {
  if (input.readyForManualPost) return 'ready_for_manual_post'
  if (input.readyForTikTokRetry) return 'ready_for_tiktok_retry'
  if (input.loginBlocked) return 'tiktok_login_blocked'
  if (input.status === 'requested') return 'staging_requested'
  if (input.status === 'failed' || input.status === 'blocked') return 'dry_run_failed'
  if (input.eligible) return 'ready_to_stage'
  return 'not_ready'
}

export function deriveTikTokStagingStatus(input: {
  status: 'success' | 'failure'
  result?: Record<string, unknown> | null
  error?: string | null
}): TikTokStagingStatus | null {
  const uploaderResult = readUploaderResult(input.result)
  if (Object.keys(objectValue(uploaderResult.livePost)).length > 0) return null
  const staging = objectValue(uploaderResult.staging)
  if (!boolValue(staging.requested)) return null

  const stoppedBeforeFinalPost = boolValue(staging.stoppedBeforeFinalPost)
  const uploadStaged = boolValue(staging.uploadStaged)
  const captionFilled = boolValue(staging.captionFilled)
  const blocker = compact(uploaderResult.blocker) ?? compact(input.error)

  if (input.status === 'success' && uploadStaged && captionFilled && stoppedBeforeFinalPost) {
    return 'ready_for_manual_post'
  }
  if (blocker === 'ASSET_MISSING' || blocker === 'TIKTOK_LOGIN_REQUIRED' || blocker?.startsWith('TIKTOK_')) {
    return 'blocked'
  }
  return 'failed'
}

export function buildTikTokStagingReadiness(
  candidateId: string | null,
  candidate: QueueStagingCandidate | null | undefined,
  pkg: QueueStagingPackage | null | undefined,
): TikTokStagingReadiness {
  const uploaderResult = readUploaderResult(pkg?.dry_run_result)
  const staging = objectValue(uploaderResult.staging)
  const blocker = compact(uploaderResult.blocker) ?? compact(pkg?.tiktok_staging_error) ?? compact(pkg?.dry_run_error)
  const requestedAt = pkg?.tiktok_staging_requested_at ?? null
  const videoStaged = boolValue(staging.uploadStaged)
  const captionFilled = boolValue(staging.captionFilled)
  const derivedReady = videoStaged && captionFilled && boolValue(staging.stoppedBeforeFinalPost)
  const status = derivedReady
    ? 'ready_for_manual_post'
    : normalizeStatus(pkg?.tiktok_staging_status)
  const readyForManualPost = status === 'ready_for_manual_post'
  const candidateApproved = APPROVED_CANDIDATE_STATUSES.has(candidate?.candidateStatus ?? '')
  const clipPrepReady = candidate?.clipPrepStatus === 'ready'
  const rbWomenMetadataOnlyRenderable = pkg?.browser_channel_key === 'rb_women' &&
    candidate?.clipPrepStatus === 'metadata_only' &&
    hasSelectedClipRange(candidate)
  const localRenderAttached = Boolean(pkg?.id) && pkg?.asset_status === 'attached' && Boolean(pkg?.local_asset_path)
  const rbCombatManualShortReady = rbCombatManualShortRenderable({ candidate, pkg, localRenderAttached })
  const clipPrepReadyForRetry = clipPrepReady || rbWomenMetadataOnlyRenderable || rbCombatManualShortReady
  const readyForTikTokRetry = candidateApproved &&
    clipPrepReadyForRetry &&
    localRenderAttached &&
    !readyForManualPost &&
    status !== 'requested'
  const tikTokSession = readSessionReadiness(uploaderResult, blocker)
  const loginBlocked = status === 'blocked' && tikTokSession === 'missing'
  const prepCanContinue = loginBlocked
  const retryAfterAccessRestored = loginBlocked &&
    clipPrepReadyForRetry &&
    localRenderAttached

  let missing: string | null = null
  if (!candidateId) missing = 'Missing Intelligence V1 candidate link.'
  else if (!candidateApproved) missing = 'Candidate must be approved first.'
  else if (!clipPrepReadyForRetry) missing = 'Clip Prep is not ready.'
  else if (!pkg?.id) missing = 'Mac mini package is missing.'
  else if (!localRenderAttached) missing = 'Local render attachment is missing.'
  else if (readyForManualPost) missing = 'Ready for manual Post.'
  else if (status === 'requested') missing = 'Staging is already requested.'
  else if (tikTokSession === 'missing') missing = 'TikTok session needs local login.'
  const eligible = missing === null

  return {
    laneLabel: pkg?.lane_label ?? null,
    channelKey: pkg?.browser_channel_key ?? null,
    packageId: pkg?.id ?? null,
    status,
    operatorState: operatorStateFor({ readyForManualPost, readyForTikTokRetry, loginBlocked, status, eligible }),
    eligible,
    readyForManualPost,
    readyForTikTokRetry,
    loginBlocked,
    prepCanContinue,
    retryAfterAccessRestored,
    blocker: missing ?? blocker,
    requestedAt,
    stagedAt: pkg?.tiktok_staging_at ?? (readyForManualPost ? pkg?.dry_run_at ?? null : null),
    attachedAssetStatus: pkg?.asset_status ?? null,
    tikTokSession,
    videoStaged,
    captionFilled,
    screenshotPath: readScreenshotPath(uploaderResult),
    error: blocker,
  }
}
