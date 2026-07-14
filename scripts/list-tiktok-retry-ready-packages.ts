import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import {
  buildQueueReadiness,
  type QueueCandidateForReadiness,
  type QueuePackageForReadiness,
} from '../lib/operator-queue-readiness'
import { validateRetryReadyLocalAsset } from '../lib/retry-ready-asset-validation'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

type PackageRow = QueuePackageForReadiness & {
  id: string
  clip_candidate_id: string
  lane_label: string | null
  source_title: string | null
  caption: string | null
  local_asset_path: string | null
  dry_run_at: string | null
  dry_run_error: string | null
  package_payload: Record<string, unknown> | null
  updated_at: string | null
}

type CandidateRow = QueueCandidateForReadiness & {
  id: string
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('--') ? value.trim() : null
}

function readLimit(): number {
  const parsed = Number(readArg('--limit') ?? process.env.TIKTOK_RETRY_READY_LIMIT ?? '')
  if (!Number.isFinite(parsed) || parsed <= 0) return 100
  return Math.min(500, Math.trunc(parsed))
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
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function clipRange(candidate: CandidateRow | null, pkg: PackageRow) {
  const clipPrep = readObject(pkg.package_payload?.clipPrep) ?? readObject(candidate?.clip_prep)
  const start = readNumber(clipPrep?.suggested_clip_start_seconds ?? candidate?.suggested_clip_start_seconds)
  const end = readNumber(clipPrep?.suggested_clip_end_seconds ?? candidate?.suggested_clip_end_seconds)
  const length = readNumber(clipPrep?.suggested_clip_length_seconds ?? candidate?.suggested_clip_length_seconds)
    ?? (start !== null && end !== null ? Number((end - start).toFixed(3)) : null)
  return { startSeconds: start, endSeconds: end, lengthSeconds: length }
}

async function main() {
  const supabase = createSupabase()
  const { data: packageRows, error: packageError } = await supabase
    .from('mac_mini_clip_packages')
    .select(
      `id, clip_candidate_id, lane_label, browser_channel_key, source_title, caption,
       package_status, handoff_status, asset_status, local_asset_path,
       dry_run_at, dry_run_result, dry_run_error,
       tiktok_staging_status, tiktok_staging_requested_at, tiktok_staging_at, tiktok_staging_error,
       package_payload, updated_at`,
    )
    .eq('asset_status', 'attached')
    .not('local_asset_path', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(readLimit())

  if (packageError) throw new Error(packageError.message)

  const packages = (packageRows ?? []) as unknown as PackageRow[]
  const candidateIds = [...new Set(packages.map((pkg) => pkg.clip_candidate_id).filter(Boolean))]
  const { data: candidateRows, error: candidateError } = candidateIds.length > 0
    ? await supabase
      .from('clip_candidates')
      .select(
        `id, status, clip_prep_status, clip_prep_confidence, clip_prep,
         suggested_clip_start_seconds, suggested_clip_end_seconds, suggested_clip_length_seconds,
         clip_reason, opening_text, edit_notes, asset_instructions`,
      )
      .in('id', candidateIds)
    : { data: [], error: null }

  if (candidateError) throw new Error(candidateError.message)

  const candidates = new Map(((candidateRows ?? []) as unknown as CandidateRow[]).map((candidate) => [candidate.id, candidate]))
  const ready = packages
    .map((pkg) => {
      const candidate = candidates.get(pkg.clip_candidate_id) ?? null
      const readiness = buildQueueReadiness(pkg.clip_candidate_id, candidate, pkg)
      return { pkg, candidate, readiness, range: clipRange(candidate, pkg) }
    })
    .filter((item) => item.readiness.tiktokStaging.readyForTikTokRetry)
  const readyWithAssetValidation = await Promise.all(ready.map(async (item) => ({
    ...item,
    assetValidation: await validateRetryReadyLocalAsset(item.pkg.local_asset_path),
  })))

  console.log(JSON.stringify({
    result: 'PASS',
    count: readyWithAssetValidation.length,
    locallyVerifiedCount: readyWithAssetValidation.filter((item) => item.assetValidation.locallyVerified).length,
    packages: readyWithAssetValidation.map(({ pkg, candidate, readiness, range, assetValidation }) => ({
      packageId: pkg.id,
      candidateId: pkg.clip_candidate_id,
      lane: pkg.lane_label,
      sourceTitle: pkg.source_title,
      assetPath: pkg.local_asset_path,
      assetStatus: pkg.asset_status,
      asset_validation: assetValidation.asset_validation,
      locallyVerified: assetValidation.locallyVerified,
      probedDurationSeconds: assetValidation.durationSeconds,
      assetValidationReason: assetValidation.reason,
      clipPrepStatus: candidate?.clip_prep_status ?? null,
      clipRange: range,
      caption: pkg.caption,
      dryRunStatus: {
        packageStatus: pkg.package_status ?? null,
        handoffStatus: pkg.handoff_status ?? null,
        dryRunAt: pkg.dry_run_at,
        dryRunError: pkg.dry_run_error,
        tiktokStagingStatus: pkg.tiktok_staging_status ?? 'not_requested',
        tiktokStagingError: pkg.tiktok_staging_error ?? null,
      },
      readiness: {
        label: 'Ready for TikTok retry',
        operatorState: readiness.tiktokStaging.operatorState,
        readyForTikTokRetry: readiness.tiktokStaging.readyForTikTokRetry,
        readyForManualPost: readiness.tiktokStaging.readyForManualPost,
        blocker: readiness.tiktokStaging.blocker,
      },
    })),
    safety: {
      readOnly: true,
      downloadsVideo: false,
      uploadsVideo: false,
      postsVideo: false,
      clicksFinalPost: false,
      livePublish: false,
      callsTikTok: false,
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
