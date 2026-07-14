import type { MacMiniAssetStatus, MacMiniHandoffStatus, MacMiniPackageStatus } from './mac-mini-handoff'

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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function compact(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim() : null
}

function boolValue(value: unknown): boolean {
  return value === true
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
  const localRenderAttached = Boolean(pkg?.id) && pkg?.asset_status === 'attached' && Boolean(pkg?.local_asset_path)
  const readyForTikTokRetry = candidateApproved &&
    clipPrepReady &&
    localRenderAttached &&
    !readyForManualPost &&
    status !== 'requested'
  const tikTokSession = readSessionReadiness(uploaderResult, blocker)
  const loginBlocked = status === 'blocked' && tikTokSession === 'missing'
  const prepCanContinue = loginBlocked
  const retryAfterAccessRestored = loginBlocked &&
    clipPrepReady &&
    localRenderAttached

  let missing: string | null = null
  if (!candidateId) missing = 'Missing Intelligence V1 candidate link.'
  else if (!candidateApproved) missing = 'Candidate must be approved first.'
  else if (!clipPrepReady) missing = 'Clip Prep is not ready.'
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
