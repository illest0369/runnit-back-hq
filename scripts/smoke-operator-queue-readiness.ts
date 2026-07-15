import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { createMacMiniClipPackageFromCandidate } from '../lib/mac-mini-handoff'
import {
  buildCandidateIntelligenceForQueue,
  buildQueueReadiness,
  extractCandidateIdFromNotes,
} from '../lib/operator-queue-readiness'
import { validateRetryReadyLocalAsset } from '../lib/retry-ready-asset-validation'

const execFileAsync = promisify(execFile)

type Row = Record<string, unknown>
type TableName = 'clip_candidates' | 'mac_mini_clip_packages'

class MemoryQuery {
  private filters: Array<{ key: string; value: unknown }> = []
  private insertPayload: Row | null = null
  private updatePayload: Row | null = null

  constructor(
    private readonly db: MemorySupabase,
    private readonly table: TableName,
  ) {}

  select() {
    return this
  }

  eq(key: string, value: unknown) {
    this.filters.push({ key, value })
    return this
  }

  insert(payload: Row) {
    this.insertPayload = payload
    return this
  }

  update(payload: Row) {
    this.updatePayload = payload
    return this
  }

  private rows(): Row[] {
    return this.db.rows(this.table).filter((row) => this.filters.every((filter) => row[filter.key] === filter.value))
  }

  async maybeSingle() {
    return { data: this.rows()[0] ?? null, error: null }
  }

  async single() {
    if (this.insertPayload) {
      this.db.insert(this.table, this.insertPayload)
      return { data: this.insertPayload, error: null }
    }

    if (this.updatePayload) {
      const row = this.rows()[0] ?? null
      if (!row) return { data: null, error: { message: 'Row not found.' } }
      Object.assign(row, this.updatePayload)
      return { data: row, error: null }
    }

    const row = this.rows()[0] ?? null
    if (!row) return { data: null, error: { message: 'Row not found.' } }
    return { data: row, error: null }
  }
}

class MemorySupabase {
  constructor(private readonly tables: Record<TableName, Row[]>) {}

  from(table: string) {
    assert.ok(table === 'clip_candidates' || table === 'mac_mini_clip_packages', `Unexpected table access: ${table}`)
    return new MemoryQuery(this, table)
  }

  rows(table: TableName) {
    return this.tables[table]
  }

  insert(table: TableName, row: Row) {
    this.tables[table].push(row)
  }
}

async function createSmokeMp4(assetPath: string) {
  await mkdir(path.dirname(assetPath), { recursive: true })
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=160x90:rate=24',
      '-t',
      '1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      assetPath,
    ],
    { maxBuffer: 1024 * 1024 * 10 },
  )
}

async function main() {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error('Smoke test forbids network calls.')
  }) as typeof fetch

  try {
    const assetRoot = path.join(process.cwd(), 'tmp', 'retry-ready-asset-validation-smoke')
    const verifiedAssetPath = path.join(assetRoot, 'verified.mp4')
    const unreadableAssetPath = path.join(assetRoot, 'unreadable.mp4')
    await rm(assetRoot, { recursive: true, force: true })
    await mkdir(assetRoot, { recursive: true })
    await createSmokeMp4(verifiedAssetPath)
    await writeFile(unreadableAssetPath, 'not an mp4')

    const verifiedAsset = await validateRetryReadyLocalAsset(verifiedAssetPath)
    assert.equal(verifiedAsset.asset_validation, 'verified')
    assert.equal(verifiedAsset.locallyVerified, true)
    assert.ok((verifiedAsset.durationSeconds ?? 0) > 0)

    const missingAssetValidation = await validateRetryReadyLocalAsset(path.join(assetRoot, 'missing.mp4'))
    assert.equal(missingAssetValidation.asset_validation, 'missing')
    assert.equal(missingAssetValidation.locallyVerified, false)
    assert.match(missingAssetValidation.reason ?? '', /does not exist/)

    const unreadableAsset = await validateRetryReadyLocalAsset(unreadableAssetPath)
    assert.equal(unreadableAsset.asset_validation, 'unreadable')
    assert.equal(unreadableAsset.locallyVerified, false)
    assert.match(unreadableAsset.reason ?? '', /ffprobe/)

    const candidateId = '11111111-1111-4111-8111-111111111111'
    const packageId = '22222222-2222-4222-8222-222222222222'
    const notes = [
      `Promoted from clip_candidate:${candidateId}`,
      'Manual approval required before render/export/n8n handoff.',
    ]
    const candidate = {
      id: candidateId,
      ingested_video_id: '33333333-3333-4333-8333-333333333333',
      target_channel_id: 'a1000000-0000-0000-0000-000000000001',
      start_seconds: 7,
      end_seconds: 24,
      title: 'Queue review smoke candidate',
      summary: 'Queue operator summary.',
      hook_text: 'The final play changed the whole argument',
      caption: 'Caption from persisted candidate.',
      hashtags: ['#RBHQ', '#QueueSmoke'],
      score: 88,
      score_breakdown: {
        model: 'rbhq_intelligence_v1',
        rankLabel: 'must_post',
        urgency: 'post_now',
        reasons: ['Fresh source momentum.', 'Strong fan reaction angle.'],
        whyNow: '0-3 hour viral window from the persisted candidate.',
        operatorSummary: 'Operator should prep this before the window cools.',
        suggestedCaption: 'Quick review: the final play changed everything.',
        suggestedHashtags: ['#RBHQ', '#SportsTok'],
      },
      clip_prep_status: 'ready',
      clip_prep_confidence: 'high',
      status: 'promoted',
      ingested_videos: {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Queue review source video',
        description: 'A final play changed the whole argument and fans are reacting.',
        platform: 'youtube',
        video_url: 'https://www.youtube.com/watch?v=QUEUEPACKAGE',
        published_at: '2026-07-09T16:00:00.000Z',
        duration_seconds: 180,
        source_channels: {
          display_name: 'ESPN',
          target_rbhq_channel_id: 'a1000000-0000-0000-0000-000000000001',
        },
      },
    }

    const extractedCandidateId = extractCandidateIdFromNotes(notes)
    assert.equal(extractedCandidateId, candidateId)

    const intelligence = buildCandidateIntelligenceForQueue(candidate)
    assert.equal(intelligence?.score, 88)
    assert.equal(intelligence?.urgency, 'post_now')
    assert.equal(intelligence?.whyNow, '0-3 hour viral window from the persisted candidate.')
    assert.equal(intelligence?.operatorSummary, 'Operator should prep this before the window cools.')
    assert.equal(intelligence?.hook, 'The final play changed the whole argument')
    assert.deepEqual(intelligence?.suggestedHashtags, ['#RBHQ', '#SportsTok'])

    const initialReadiness = buildQueueReadiness(candidateId, candidate, null)
    assert.equal(initialReadiness.clipPrepReady, true)
    assert.equal(initialReadiness.macMiniPackageReady, false)
    assert.equal(initialReadiness.localRenderAttached, false)

    const db = new MemorySupabase({
      clip_candidates: [candidate],
      mac_mini_clip_packages: [],
    })
    const pkg = await createMacMiniClipPackageFromCandidate(db as never, candidateId, {
      now: () => new Date('2026-07-09T16:30:00.000Z'),
      packageId,
    })
    assert.equal(pkg.id, packageId)
    assert.equal(pkg.packageStatus, 'ready')
    assert.equal(pkg.handoffStatus, 'pending')
    assert.equal(pkg.payload.publishAction, 'dry_run')
    assert.equal(pkg.payload.testMode, true)
    assert.equal(pkg.payload.safety.livePostingAllowed, false)
    assert.equal(pkg.payload.safety.metricoolAllowed, false)
    assert.equal(pkg.payload.safety.finalPostClickAllowed, false)
    assert.equal(pkg.payload.captionPrep.subtitle_source, 'metadata_only')
    assert.equal(pkg.payload.captionPrep.suggested_subtitle_style.burned_in, false)

    const packageRow = db.rows('mac_mini_clip_packages')[0]
    const packagedReadiness = buildQueueReadiness(candidateId, candidate, {
      id: String(packageRow?.id),
      package_status: packageRow?.package_status as never,
      handoff_status: packageRow?.handoff_status as never,
      asset_status: packageRow?.asset_status as never,
      local_asset_path: packageRow?.local_asset_path as string | null,
    })
    assert.equal(packagedReadiness.macMiniPackageReady, true)
    assert.equal(packagedReadiness.localRenderAttached, false)

    const notYetStagedReadiness = buildQueueReadiness(candidateId, candidate, {
      id: String(packageRow?.id),
      lane_label: String(packageRow?.lane_label),
      browser_channel_key: String(packageRow?.browser_channel_key),
      package_status: 'ready',
      handoff_status: 'pending',
      asset_status: 'attached',
      local_asset_path: verifiedAssetPath,
      tiktok_staging_status: 'not_requested',
    })
    assert.equal(notYetStagedReadiness.clipPrepReady, true)
    assert.equal(notYetStagedReadiness.localRenderAttached, true)
    assert.equal(notYetStagedReadiness.tiktokStaging.status, 'not_requested')
    assert.equal(notYetStagedReadiness.tiktokStaging.readyForTikTokRetry, true)
    assert.equal(notYetStagedReadiness.tiktokStaging.operatorState, 'ready_for_tiktok_retry')
    assert.equal(notYetStagedReadiness.tiktokStaging.eligible, true)
    assert.equal(notYetStagedReadiness.tiktokStaging.readyForManualPost, false)

    const retryReadyReadiness = buildQueueReadiness(candidateId, candidate, {
      id: String(packageRow?.id),
      lane_label: String(packageRow?.lane_label),
      browser_channel_key: String(packageRow?.browser_channel_key),
      package_status: 'dry_run_failed',
      handoff_status: 'dry_run_failed',
      asset_status: 'attached',
      local_asset_path: '/tmp/mac-mini-assets/rbhq-smoke.mp4',
      dry_run_error: 'TIKTOK_UPLOAD_PROCESSING_TIMEOUT',
      tiktok_staging_status: 'blocked',
      tiktok_staging_error: 'TIKTOK_UPLOAD_PROCESSING_TIMEOUT',
    })
    assert.equal(retryReadyReadiness.tiktokStaging.readyForTikTokRetry, true)
    assert.equal(retryReadyReadiness.tiktokStaging.operatorState, 'ready_for_tiktok_retry')
    assert.equal(retryReadyReadiness.tiktokStaging.readyForManualPost, false)
    assert.equal(retryReadyReadiness.localRenderAttached, true)

    const loginBlockedReadiness = buildQueueReadiness(candidateId, candidate, {
      id: String(packageRow?.id),
      lane_label: String(packageRow?.lane_label),
      browser_channel_key: String(packageRow?.browser_channel_key),
      package_status: 'dry_run_failed',
      handoff_status: 'dry_run_failed',
      asset_status: 'attached',
      local_asset_path: '/tmp/mac-mini-assets/rbhq-smoke.mp4',
      dry_run_error: 'TIKTOK_LOGIN_REQUIRED',
      dry_run_result: {
        uploaderResult: {
          blocker: 'TIKTOK_LOGIN_REQUIRED',
          logged_in: false,
          staging: {
            requested: true,
            uploadStaged: false,
            captionFilled: false,
            stoppedBeforeFinalPost: true,
            manualApprovalRequired: true,
          },
          safety: {
            usesTikTokApi: false,
            marksRbhqPublished: false,
            clicksFinalPost: false,
          },
        },
      },
      tiktok_staging_status: 'blocked',
      tiktok_staging_error: 'TIKTOK_LOGIN_REQUIRED',
    })
    assert.equal(loginBlockedReadiness.tiktokStaging.operatorState, 'ready_for_tiktok_retry')
    assert.equal(loginBlockedReadiness.tiktokStaging.loginBlocked, true)
    assert.equal(loginBlockedReadiness.tiktokStaging.readyForTikTokRetry, true)
    assert.equal(loginBlockedReadiness.tiktokStaging.operatorState, 'ready_for_tiktok_retry')
    assert.equal(loginBlockedReadiness.tiktokStaging.prepCanContinue, true)
    assert.equal(loginBlockedReadiness.tiktokStaging.retryAfterAccessRestored, true)
    assert.equal(loginBlockedReadiness.tiktokStaging.tikTokSession, 'missing')
    assert.equal(loginBlockedReadiness.localRenderAttached, true)
    assert.equal(fetchCalls, 0)

    console.log(JSON.stringify({
      result: 'PASS',
      candidate: {
        extractedCandidateId,
        score: intelligence?.score,
        urgency: intelligence?.urgency,
        whyNow: intelligence?.whyNow,
        operatorSummary: intelligence?.operatorSummary,
      },
      readiness: {
        clipPrepReady: packagedReadiness.clipPrepReady,
        macMiniPackageReady: packagedReadiness.macMiniPackageReady,
        localRenderAttached: packagedReadiness.localRenderAttached,
        packageId: packagedReadiness.macMiniPackageId,
        captionPrepSource: pkg.payload.captionPrep.subtitle_source,
        notYetStagedReadyForTikTokRetry: notYetStagedReadiness.tiktokStaging.readyForTikTokRetry,
        notYetStagedOperatorState: notYetStagedReadiness.tiktokStaging.operatorState,
        readyForTikTokRetry: retryReadyReadiness.tiktokStaging.readyForTikTokRetry,
        retryOperatorState: retryReadyReadiness.tiktokStaging.operatorState,
        tiktokLoginBlocked: loginBlockedReadiness.tiktokStaging.loginBlocked,
        prepCanContinue: loginBlockedReadiness.tiktokStaging.prepCanContinue,
        retryAfterAccessRestored: loginBlockedReadiness.tiktokStaging.retryAfterAccessRestored,
      },
      assetValidation: {
        verified: verifiedAsset.asset_validation,
        verifiedDurationSeconds: verifiedAsset.durationSeconds,
        missing: missingAssetValidation.asset_validation,
        unreadable: unreadableAsset.asset_validation,
      },
      safety: {
        networkCalls: fetchCalls,
        publishAction: pkg.payload.publishAction,
        livePostingAllowed: pkg.payload.safety.livePostingAllowed,
        metricoolAllowed: pkg.payload.safety.metricoolAllowed,
        finalPostClickAllowed: pkg.payload.safety.finalPostClickAllowed,
      },
    }, null, 2))
  } finally {
    globalThis.fetch = originalFetch
  }
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
