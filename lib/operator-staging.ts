import type { MacMiniAssetStatus, MacMiniHandoffStatus, MacMiniPackageStatus } from './mac-mini-handoff'

export type TikTokStagingStatus =
  | 'not_requested'
  | 'requested'
  | 'ready_for_manual_post'
  | 'blocked'
  | 'failed'

export type TikTokSessionReadiness = 'ready' | 'missing' | 'unknown'

export type TikTokStagingReadiness = {
  laneLabel: string | null
  channelKey: string | null
  packageId: string | null
  status: TikTokStagingStatus
  eligible: boolean
  readyForManualPost: boolean
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

export function deriveTikTokStagingStatus(input: {
  status: 'success' | 'failure'
  result?: Record<string, unknown> | null
  error?: string | null
}): TikTokStagingStatus | null {
  const uploaderResult = readUploaderResult(input.result)
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

  let missing: string | null = null
  if (!candidateId) missing = 'Missing Intelligence V1 candidate link.'
  else if (!APPROVED_CANDIDATE_STATUSES.has(candidate?.candidateStatus ?? '')) missing = 'Candidate must be approved first.'
  else if (candidate?.clipPrepStatus !== 'ready') missing = 'Clip Prep is not ready.'
  else if (!pkg?.id) missing = 'Mac mini package is missing.'
  else if (pkg.asset_status !== 'attached' || !pkg.local_asset_path) missing = 'Local render attachment is missing.'
  else if (readyForManualPost) missing = 'Ready for manual Post.'
  else if (status === 'requested') missing = 'Staging is already requested.'
  else if (readSessionReadiness(uploaderResult, blocker) === 'missing') missing = 'TikTok session needs local login.'

  return {
    laneLabel: pkg?.lane_label ?? null,
    channelKey: pkg?.browser_channel_key ?? null,
    packageId: pkg?.id ?? null,
    status,
    eligible: missing === null,
    readyForManualPost,
    blocker: missing ?? blocker,
    requestedAt,
    stagedAt: pkg?.tiktok_staging_at ?? (readyForManualPost ? pkg?.dry_run_at ?? null : null),
    attachedAssetStatus: pkg?.asset_status ?? null,
    tikTokSession: readSessionReadiness(uploaderResult, blocker),
    videoStaged,
    captionFilled,
    screenshotPath: readScreenshotPath(uploaderResult),
    error: blocker,
  }
}
