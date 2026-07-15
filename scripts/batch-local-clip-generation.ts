import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import {
  attachMacMiniLocalAsset,
  createMacMiniClipPackageFromCandidate,
  type MacMiniAssetStatus,
  type MacMiniClipPackage,
  type MacMiniHandoffStatus,
  type MacMiniPackageStatus,
} from '../lib/mac-mini-handoff'
import {
  buildQueueReadiness,
  type QueueCandidateForReadiness,
  type QueuePackageForReadiness,
} from '../lib/operator-queue-readiness'
import { validateRetryReadyLocalAsset } from '../lib/retry-ready-asset-validation'
import {
  renderLocalClipPrepForCandidateOrPackage,
  renderLocalClipPrepVerticalAsset,
  type LocalRenderQualityValidation,
} from '../lib/local-render-prep'
import type { CaptionPrepV1 } from '../lib/clip-prep'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

type BatchDb = Pick<SupabaseClient, 'from'>

type BatchItemStatus = 'rendered' | 'skipped' | 'source_missing' | 'validation_failed' | 'attached'

type CandidateRow = QueueCandidateForReadiness & {
  id: string
  title?: string | null
  status?: string | null
  clip_prep_status?: string | null
  clip_prep_confidence?: string | null
  ingested_video_id?: string | null
}

type PackageRow = QueuePackageForReadiness & {
  id: string
  clip_candidate_id: string
  lane_label: string | null
  source_title: string | null
  source_url: string | null
  caption: string | null
  package_payload: Record<string, unknown> | null
  package_status: MacMiniPackageStatus | null
  handoff_status: MacMiniHandoffStatus | null
  asset_status: MacMiniAssetStatus | null
  local_asset_path: string | null
  updated_at: string | null
}

export type BatchLocalClipGenerationItem = {
  packageId: string | null
  candidateId: string
  lane: string | null
  sourceTitle: string | null
  clipRange: {
    startSeconds: number | null
    endSeconds: number | null
    lengthSeconds: number | null
  }
  assetPath: string | null
  captionPrep: CaptionPrepV1 | null
  status: BatchItemStatus
  attached: boolean
  sourceDownloaded: boolean
  qualityValidation: LocalRenderQualityValidation | null
  error: string | null
}

export type BatchLocalClipGenerationResult = {
  result: 'PASS'
  selectedCount: number
  items: BatchLocalClipGenerationItem[]
  readyForTikTokRetry: {
    count: number
    packages: Array<{
      packageId: string
      candidateId: string
      lane: string | null
      sourceTitle: string | null
      assetPath: string | null
      clipRange: BatchLocalClipGenerationItem['clipRange']
      caption: string | null
      captionPrep: CaptionPrepV1 | null
      readiness: {
        label: 'Ready for TikTok retry'
        readyForTikTokRetry: boolean
        readyForManualPost: boolean
        operatorState: string
        blocker: string | null
      }
      assetValidation: {
        locallyVerified: boolean
        asset_validation: string
        durationSeconds: number | null
        reason: string | null
      }
    }>
  }
  safety: {
    manualOnly: true
    downloadsVideo: boolean
    uploadsVideo: false
    postsVideo: false
    clicksFinalPost: false
    triggersTikTokDryRun: false
    stageUpload: false
    livePublish: false
    callsTikTok: false
  }
}

type BatchTarget = {
  candidateId: string
  pkg: PackageRow | null
  candidate: CandidateRow | null
}

const APPROVED_CANDIDATE_STATUSES = ['approved', 'approved_for_review', 'approved_for_handoff', 'promoted']

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('--') ? value.trim() : null
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function readLimitArg(): number {
  const parsed = Number(readArg('--limit') ?? process.env.CLIP_PREP_BATCH_LIMIT ?? '')
  if (!Number.isFinite(parsed) || parsed <= 0) return 5
  return Math.min(50, Math.trunc(parsed))
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(supabaseUrl, serviceKey)
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readCaptionPrep(value: unknown): CaptionPrepV1 | null {
  const record = readObject(value)
  return record?.version === 'rbhq-caption-prep-v1' ? record as unknown as CaptionPrepV1 : null
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function clipRange(candidate: CandidateRow | null, pkg: PackageRow | null): BatchLocalClipGenerationItem['clipRange'] {
  const clipPrep = readObject(pkg?.package_payload?.clipPrep) ?? readObject(candidate?.clip_prep)
  const start = readNumber(clipPrep?.suggested_clip_start_seconds ?? candidate?.suggested_clip_start_seconds)
  const end = readNumber(clipPrep?.suggested_clip_end_seconds ?? candidate?.suggested_clip_end_seconds)
  const length = readNumber(clipPrep?.suggested_clip_length_seconds ?? candidate?.suggested_clip_length_seconds)
    ?? (start !== null && end !== null ? Number((end - start).toFixed(3)) : null)
  return { startSeconds: start, endSeconds: end, lengthSeconds: length }
}

function openingText(candidate: CandidateRow | null, pkg: PackageRow | null): string | null {
  const clipPrep = readObject(pkg?.package_payload?.clipPrep) ?? readObject(candidate?.clip_prep)
  const value = clipPrep?.opening_text ?? candidate?.opening_text
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function captionPrep(candidate: CandidateRow | null, pkg: PackageRow | null): CaptionPrepV1 | null {
  const packageClipPrep = readObject(pkg?.package_payload?.clipPrep)
  const candidateClipPrep = readObject(candidate?.clip_prep)
  return readCaptionPrep(pkg?.package_payload?.captionPrep)
    ?? readCaptionPrep(packageClipPrep?.caption_prep)
    ?? readCaptionPrep(candidateClipPrep?.caption_prep)
}

function packageRowFromMacMini(pkg: MacMiniClipPackage): PackageRow {
  return {
    id: pkg.id,
    clip_candidate_id: pkg.clipCandidateId,
    lane_label: pkg.laneLabel,
    browser_channel_key: pkg.browserChannelKey,
    source_title: pkg.sourceTitle,
    source_url: pkg.sourceUrl,
    caption: pkg.caption,
    package_payload: pkg.payload as unknown as Record<string, unknown>,
    package_status: pkg.packageStatus,
    handoff_status: pkg.handoffStatus,
    asset_status: pkg.assetStatus,
    local_asset_path: pkg.localAssetPath,
    dry_run_at: pkg.dryRunAt,
    dry_run_result: pkg.dryRunResult,
    dry_run_error: pkg.dryRunError,
    tiktok_staging_status: pkg.tikTokStagingStatus,
    tiktok_staging_requested_at: pkg.tikTokStagingRequestedAt,
    tiktok_staging_at: pkg.tikTokStagingAt,
    tiktok_staging_error: pkg.tikTokStagingError,
    updated_at: pkg.updatedAt,
  }
}

async function loadCandidateMap(db: BatchDb, candidateIds: string[]): Promise<Map<string, CandidateRow>> {
  if (candidateIds.length === 0) return new Map()
  const { data, error } = await db
    .from('clip_candidates')
    .select(
      `id, status, title, hook_text, caption, hashtags, score, score_breakdown,
       clip_prep, suggested_clip_start_seconds, suggested_clip_end_seconds, suggested_clip_length_seconds,
       clip_reason, opening_text, edit_notes, asset_instructions, clip_prep_status, clip_prep_confidence`,
    )
    .in('id', [...new Set(candidateIds)])

  if (error) throw new Error(error.message)
  return new Map(((data ?? []) as unknown as CandidateRow[]).map((candidate) => [candidate.id, candidate]))
}

async function loadExistingPackageMap(db: BatchDb, candidateIds: string[]): Promise<Map<string, PackageRow>> {
  if (candidateIds.length === 0) return new Map()
  const { data, error } = await db
    .from('mac_mini_clip_packages')
    .select(
      `id, clip_candidate_id, lane_label, browser_channel_key, source_title, source_url, caption,
       package_status, handoff_status, asset_status, local_asset_path,
       dry_run_at, dry_run_result, dry_run_error,
       tiktok_staging_status, tiktok_staging_requested_at, tiktok_staging_at, tiktok_staging_error,
       package_payload, updated_at`,
    )
    .in('clip_candidate_id', [...new Set(candidateIds)])

  if (error) throw new Error(error.message)
  return new Map(((data ?? []) as unknown as PackageRow[]).map((pkg) => [pkg.clip_candidate_id, pkg]))
}

async function selectBatchTargets(
  db: BatchDb,
  input: { limit: number; rerender?: boolean },
): Promise<BatchTarget[]> {
  const targets: BatchTarget[] = []
  const { data: packageRows, error: packageError } = await db
    .from('mac_mini_clip_packages')
    .select(
      `id, clip_candidate_id, lane_label, browser_channel_key, source_title, source_url, caption,
       package_status, handoff_status, asset_status, local_asset_path,
       dry_run_at, dry_run_result, dry_run_error,
       tiktok_staging_status, tiktok_staging_requested_at, tiktok_staging_at, tiktok_staging_error,
       package_payload, updated_at`,
    )
    .neq('tiktok_staging_status', 'ready_for_manual_post')
    .order('updated_at', { ascending: false })
    .limit(Math.max(input.limit * 3, input.limit))

  if (packageError) throw new Error(packageError.message)

  const packages = (packageRows ?? []) as unknown as PackageRow[]
  const candidateMap = await loadCandidateMap(db, packages.map((pkg) => pkg.clip_candidate_id).filter(Boolean))
  for (const pkg of packages) {
    if (targets.length >= input.limit) break
    const candidate = candidateMap.get(pkg.clip_candidate_id) ?? null
    if (candidate?.clip_prep_status !== 'ready') continue
    if (!input.rerender && pkg.asset_status === 'attached' && pkg.local_asset_path) continue
    targets.push({ candidateId: pkg.clip_candidate_id, pkg, candidate })
  }

  if (targets.length >= input.limit) return targets

  const { data: candidateRows, error: candidateError } = await db
    .from('clip_candidates')
    .select(
      `id, status, title, hook_text, caption, hashtags, score, score_breakdown,
       clip_prep, suggested_clip_start_seconds, suggested_clip_end_seconds, suggested_clip_length_seconds,
       clip_reason, opening_text, edit_notes, asset_instructions, clip_prep_status, clip_prep_confidence`,
    )
    .eq('clip_prep_status', 'ready')
    .in('status', APPROVED_CANDIDATE_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(Math.max((input.limit - targets.length) * 3, input.limit - targets.length))

  if (candidateError) throw new Error(candidateError.message)

  const existingCandidateIds = new Set(targets.map((target) => target.candidateId))
  const candidates = ((candidateRows ?? []) as unknown as CandidateRow[])
    .filter((candidate) => !existingCandidateIds.has(candidate.id))
  const packageMap = await loadExistingPackageMap(db, candidates.map((candidate) => candidate.id))
  for (const candidate of candidates) {
    if (targets.length >= input.limit) break
    const pkg = packageMap.get(candidate.id) ?? null
    if (pkg?.tiktok_staging_status === 'ready_for_manual_post') continue
    if (pkg && !input.rerender && pkg.asset_status === 'attached' && pkg.local_asset_path) continue
    targets.push({ candidateId: candidate.id, pkg, candidate })
  }

  return targets
}

async function readyForTikTokRetryList(db: BatchDb): Promise<BatchLocalClipGenerationResult['readyForTikTokRetry']> {
  const { data: packageRows, error: packageError } = await db
    .from('mac_mini_clip_packages')
    .select(
      `id, clip_candidate_id, lane_label, browser_channel_key, source_title, source_url, caption,
       package_status, handoff_status, asset_status, local_asset_path,
       dry_run_at, dry_run_result, dry_run_error,
       tiktok_staging_status, tiktok_staging_requested_at, tiktok_staging_at, tiktok_staging_error,
       package_payload, updated_at`,
    )
    .eq('asset_status', 'attached')
    .order('updated_at', { ascending: false })
    .limit(500)

  if (packageError) throw new Error(packageError.message)
  const packages = ((packageRows ?? []) as unknown as PackageRow[]).filter((pkg) => Boolean(pkg.local_asset_path))
  const candidateMap = await loadCandidateMap(db, packages.map((pkg) => pkg.clip_candidate_id).filter(Boolean))
  const ready = await Promise.all(packages.map(async (pkg) => {
    const candidate = candidateMap.get(pkg.clip_candidate_id) ?? null
    const readiness = buildQueueReadiness(pkg.clip_candidate_id, candidate, pkg)
    if (!readiness.tiktokStaging.readyForTikTokRetry) return null
    const assetValidation = await validateRetryReadyLocalAsset(pkg.local_asset_path)
    return {
      packageId: pkg.id,
      candidateId: pkg.clip_candidate_id,
      lane: pkg.lane_label,
      sourceTitle: pkg.source_title,
      assetPath: pkg.local_asset_path,
      clipRange: clipRange(candidate, pkg),
      caption: pkg.caption,
      captionPrep: captionPrep(candidate, pkg),
      readiness: {
        label: 'Ready for TikTok retry' as const,
        readyForTikTokRetry: readiness.tiktokStaging.readyForTikTokRetry,
        readyForManualPost: readiness.tiktokStaging.readyForManualPost,
        operatorState: readiness.tiktokStaging.operatorState,
        blocker: readiness.tiktokStaging.blocker,
      },
      assetValidation: {
        locallyVerified: assetValidation.locallyVerified,
        asset_validation: assetValidation.asset_validation,
        durationSeconds: assetValidation.durationSeconds,
        reason: assetValidation.reason,
      },
    }
  }))
  const packagesReady = ready.filter((item): item is NonNullable<typeof item> => Boolean(item))
  return { count: packagesReady.length, packages: packagesReady }
}

function isSourceMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /source_missing|Source URL requires explicit --download-source|refuses URL sources/i.test(message)
}

function itemBase(target: BatchTarget, pkg: PackageRow | null): Omit<BatchLocalClipGenerationItem, 'status' | 'attached' | 'sourceDownloaded' | 'qualityValidation' | 'assetPath' | 'error'> {
  return {
    packageId: pkg?.id ?? null,
    candidateId: target.candidateId,
    lane: pkg?.lane_label ?? null,
    sourceTitle: pkg?.source_title ?? target.candidate?.title ?? null,
    clipRange: clipRange(target.candidate, pkg),
    captionPrep: captionPrep(target.candidate, pkg),
  }
}

export async function runBatchLocalClipGeneration(
  db: BatchDb,
  input: {
    limit?: number
    assetRoot?: string | null
    sourceDir?: string | null
    outputDir?: string | null
    attach?: boolean
    rerender?: boolean
    downloadSource?: boolean
    now?: () => Date
  } = {},
): Promise<BatchLocalClipGenerationResult> {
  const limit = Math.min(50, Math.max(1, Math.trunc(input.limit ?? 5)))
  const targets = await selectBatchTargets(db, { limit, rerender: input.rerender })
  const items: BatchLocalClipGenerationItem[] = []
  let downloaded = false

  for (const target of targets) {
    let pkg = target.pkg
    try {
      if (!pkg) {
        pkg = packageRowFromMacMini(await createMacMiniClipPackageFromCandidate(db, target.candidateId, { now: input.now }))
      }
      if (pkg.tiktok_staging_status === 'ready_for_manual_post') {
        items.push({
          ...itemBase(target, pkg),
          assetPath: pkg.local_asset_path,
          status: 'skipped',
          attached: false,
          sourceDownloaded: false,
          qualityValidation: null,
          error: 'Package is already Ready for manual Post.',
        })
        continue
      }
      if (!input.rerender && pkg.asset_status === 'attached' && pkg.local_asset_path) {
        items.push({
          ...itemBase(target, pkg),
          assetPath: pkg.local_asset_path,
          status: 'skipped',
          attached: false,
          sourceDownloaded: false,
          qualityValidation: null,
          error: 'Package already has an attached asset. Use --rerender to replace it.',
        })
        continue
      }

      const clipped = await renderLocalClipPrepForCandidateOrPackage(db, {
        packageId: pkg.id,
        assetRoot: input.assetRoot,
        sourceDir: input.sourceDir,
        outputDir: input.outputDir,
        downloadSource: input.downloadSource,
        attach: false,
        now: input.now,
      })
      downloaded = downloaded || clipped.sourceDownloaded
      const vertical = await renderLocalClipPrepVerticalAsset({
        sourcePath: clipped.outputPath,
        packageId: pkg.id,
        assetRoot: input.assetRoot,
        outputDir: input.outputDir,
        openingText: openingText(target.candidate, pkg),
        captionPrep: clipped.captionPrep,
      })
      const attachedPackage = input.attach
        ? await attachMacMiniLocalAsset(db, pkg.id, vertical.outputPath, {
            assetRoot: input.assetRoot ?? undefined,
            now: input.now,
          })
        : null
      items.push({
        ...itemBase(target, pkg),
        packageId: pkg.id,
        assetPath: attachedPackage?.localAssetPath ?? vertical.outputPath,
        captionPrep: vertical.captionPrep,
        status: attachedPackage ? 'attached' : 'rendered',
        attached: Boolean(attachedPackage),
        sourceDownloaded: clipped.sourceDownloaded,
        qualityValidation: vertical.qualityValidation,
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      items.push({
        ...itemBase(target, pkg),
        packageId: pkg?.id ?? target.pkg?.id ?? null,
        assetPath: null,
        status: isSourceMissing(error) ? 'source_missing' : 'validation_failed',
        attached: false,
        sourceDownloaded: false,
        qualityValidation: null,
        error: message,
      })
    }
  }

  const readyForTikTokRetry = await readyForTikTokRetryList(db)
  return {
    result: 'PASS',
    selectedCount: targets.length,
    items,
    readyForTikTokRetry,
    safety: {
      manualOnly: true,
      downloadsVideo: downloaded,
      uploadsVideo: false,
      postsVideo: false,
      clicksFinalPost: false,
      triggersTikTokDryRun: false,
      stageUpload: false,
      livePublish: false,
      callsTikTok: false,
    },
  }
}

async function main() {
  const result = await runBatchLocalClipGeneration(createSupabase(), {
    limit: readLimitArg(),
    assetRoot: readArg('--asset-root') ?? process.env.MAC_MINI_ASSET_ROOT?.trim() ?? null,
    sourceDir: readArg('--source-dir') ?? process.env.CLIP_PREP_LOCAL_SOURCE_DIR?.trim() ?? null,
    outputDir: readArg('--output-dir') ?? null,
    attach: hasFlag('--attach'),
    rerender: hasFlag('--rerender'),
    downloadSource: hasFlag('--download-source'),
  })

  console.log(JSON.stringify(result, null, 2))
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
    process.exitCode = 1
  })
}
