import assert from 'node:assert/strict'

import { recordMacMiniPackageDryRun, requestTikTokStagingForPackage } from '../lib/mac-mini-handoff'
import { buildQueueReadiness } from '../lib/operator-queue-readiness'

type Row = Record<string, unknown>
type TableName = 'mac_mini_clip_packages'

class MemoryQuery {
  private filters: Array<{ key: string; value: unknown }> = []
  private inFilters: Array<{ key: string; values: unknown[] }> = []
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

  in(key: string, values: unknown[]) {
    this.inFilters.push({ key, values })
    return this
  }

  update(payload: Row) {
    this.updatePayload = payload
    return this
  }

  private rows(): Row[] {
    return this.db.rows(this.table)
      .filter((row) => this.filters.every((filter) => row[filter.key] === filter.value))
      .filter((row) => this.inFilters.every((filter) => filter.values.includes(row[filter.key])))
  }

  async maybeSingle() {
    return { data: this.rows()[0] ?? null, error: null }
  }

  async single() {
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
    assert.equal(table, 'mac_mini_clip_packages')
    return new MemoryQuery(this, table)
  }

  rows(table: TableName) {
    return this.tables[table]
  }
}

function packageRow(input: Partial<Row> = {}): Row {
  const packageId = String(input.id ?? '22222222-2222-4222-8222-222222222222')
  return {
    id: packageId,
    clip_candidate_id: '11111111-1111-4111-8111-111111111111',
    ingested_video_id: '33333333-3333-4333-8333-333333333333',
    target_channel_id: 'a1000000-0000-0000-0000-000000000001',
    lane_label: 'RB Sports',
    lane_slug: 'sports',
    browser_channel_key: 'rb_sports',
    source_url: 'https://www.youtube.com/watch?v=STAGINGUX',
    source_title: 'Operator staging source',
    source_name: 'ESPN',
    caption: 'Caption prepared for staging.',
    hashtags: ['#RBHQ'],
    why_now: 'Approved candidate is ready for staging.',
    hook: 'The hook is ready',
    operator_summary: 'Operator can stage this safely.',
    edit_notes: ['Dry-run only: local browser worker must not click final TikTok Post.'],
    score: 91,
    package_payload: {
      version: 'rbhq-mac-mini-clip-package-v1',
      targetPlatform: 'tiktok',
      publishAction: 'dry_run',
      testMode: true,
      packageId,
      candidateId: '11111111-1111-4111-8111-111111111111',
      lane: {
        label: 'RB Sports',
        slug: 'sports',
        browserChannelKey: 'rb_sports',
        targetChannelId: 'a1000000-0000-0000-0000-000000000001',
      },
      source: {
        url: 'https://www.youtube.com/watch?v=STAGINGUX',
        title: 'Operator staging source',
        name: 'ESPN',
      },
      tiktokDraft: {
        caption: 'Caption prepared for staging.',
        hashtags: ['#RBHQ'],
        mediaPath: '/tmp/rbhq-smoke.mp4',
        publishAction: 'dry_run',
        testMode: true,
      },
      safety: {
        livePostingAllowed: false,
        metricoolAllowed: false,
        schedulerDependencyAllowed: false,
        operatorCredentialsRequired: false,
        finalPostClickAllowed: false,
      },
      createdAt: '2026-07-10T12:00:00.000Z',
    },
    package_status: 'ready',
    handoff_status: 'pending',
    worker_id: null,
    fetched_at: null,
    dry_run_at: null,
    dry_run_result: null,
    dry_run_error: null,
    local_asset_path: '/tmp/rbhq-smoke.mp4',
    asset_status: 'attached',
    asset_error: null,
    asset_attached_at: '2026-07-10T12:01:00.000Z',
    tiktok_staging_status: 'not_requested',
    tiktok_staging_requested_at: null,
    tiktok_staging_requested_by: null,
    tiktok_staging_at: null,
    tiktok_staging_error: null,
    created_at: '2026-07-10T12:00:00.000Z',
    updated_at: '2026-07-10T12:00:00.000Z',
    ...input,
  }
}

async function main() {
  const candidate = {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'approved_for_handoff',
    clip_prep_status: 'ready',
    clip_prep_confidence: 'high',
  }

  const missingAsset = buildQueueReadiness(candidate.id, candidate, {
    id: 'missing-asset-package',
    lane_label: 'RB Sports',
    browser_channel_key: 'rb_sports',
    package_status: 'ready',
    handoff_status: 'pending',
    asset_status: 'missing',
    local_asset_path: null,
  })
  assert.equal(missingAsset.tiktokStaging.eligible, false)
  assert.equal(missingAsset.tiktokStaging.blocker, 'Local render attachment is missing.')

  const db = new MemorySupabase({ mac_mini_clip_packages: [packageRow()] })
  const requested = await requestTikTokStagingForPackage(db as never, '22222222-2222-4222-8222-222222222222', {
    requestedBy: 'operator-smoke',
    now: () => new Date('2026-07-10T12:02:00.000Z'),
  })
  assert.equal(requested.tikTokStagingStatus, 'requested')
  assert.equal(requested.packageStatus, 'ready')
  assert.equal(requested.handoffStatus, 'pending')

  const requestedReadiness = buildQueueReadiness(candidate.id, candidate, db.rows('mac_mini_clip_packages')[0] as never)
  assert.equal(requestedReadiness.tiktokStaging.eligible, false)
  assert.equal(requestedReadiness.tiktokStaging.blocker, 'Staging is already requested.')

  await recordMacMiniPackageDryRun(db as never, requested.id, {
    status: 'failure',
    workerId: 'mac-mini-smoke',
    error: 'TIKTOK_LOGIN_REQUIRED',
    result: {
      packageId: requested.id,
      channelKey: 'rb_sports',
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
        artifacts: {
          uploadPageScreenshot: '/tmp/tiktok-web-upload-artifacts/login-required.png',
        },
        safety: {
          usesTikTokApi: false,
          marksRbhqPublished: false,
          clicksFinalPost: false,
        },
      },
      safety: {
        publishAction: 'dry_run',
        callsMetricool: false,
        callsN8n: false,
        schedulesPost: false,
        clicksFinalPost: false,
        livePublishStateSet: false,
      },
    },
    now: () => new Date('2026-07-10T12:03:00.000Z'),
  })

  const loginBlocked = buildQueueReadiness(candidate.id, candidate, db.rows('mac_mini_clip_packages')[0] as never)
  assert.equal(loginBlocked.tiktokStaging.status, 'blocked')
  assert.equal(loginBlocked.tiktokStaging.tikTokSession, 'missing')
  assert.equal(loginBlocked.tiktokStaging.blocker, 'TikTok session needs local login.')

  await requestTikTokStagingForPackage(db as never, requested.id, {
    requestedBy: 'operator-smoke',
    now: () => new Date('2026-07-10T12:04:00.000Z'),
  })
  const staged = await recordMacMiniPackageDryRun(db as never, requested.id, {
    status: 'success',
    workerId: 'mac-mini-smoke',
    result: {
      packageId: requested.id,
      channelKey: 'rb_sports',
      uploaderResult: {
        blocker: null,
        logged_in: true,
        staging: {
          requested: true,
          uploadStaged: true,
          captionFilled: true,
          stoppedBeforeFinalPost: true,
          manualApprovalRequired: true,
        },
        artifacts: {
          stagedUploadScreenshot: '/tmp/tiktok-web-upload-artifacts/staged-upload.png',
        },
        safety: {
          usesTikTokApi: false,
          storesTikTokCredentialsInRbhq: false,
          marksRbhqPublished: false,
          clicksFinalPost: false,
        },
      },
      safety: {
        publishAction: 'dry_run',
        callsMetricool: false,
        callsN8n: false,
        schedulesPost: false,
        clicksFinalPost: false,
        livePublishStateSet: false,
      },
    },
    now: () => new Date('2026-07-10T12:05:00.000Z'),
  })

  assert.equal(staged.tikTokStagingStatus, 'ready_for_manual_post')
  assert.equal(staged.packageStatus, 'dry_run_complete')
  assert.equal(staged.handoffStatus, 'dry_run_succeeded')

  const ready = buildQueueReadiness(candidate.id, candidate, db.rows('mac_mini_clip_packages')[0] as never)
  assert.equal(ready.tiktokStaging.readyForManualPost, true)
  assert.equal(ready.tiktokStaging.videoStaged, true)
  assert.equal(ready.tiktokStaging.captionFilled, true)
  assert.equal(ready.tiktokStaging.screenshotPath, '/tmp/tiktok-web-upload-artifacts/staged-upload.png')
  assert.equal(ready.tiktokStaging.eligible, false)

  const row = db.rows('mac_mini_clip_packages')[0]
  assert.notEqual(row.package_status, 'published')
  assert.notEqual(row.handoff_status, 'published')

  console.log(JSON.stringify({
    result: 'PASS',
    readiness: {
      missingAssetBlocker: missingAsset.tiktokStaging.blocker,
      missingSession: loginBlocked.tiktokStaging.tikTokSession,
      readyForManualPost: ready.tiktokStaging.readyForManualPost,
      videoStaged: ready.tiktokStaging.videoStaged,
      captionFilled: ready.tiktokStaging.captionFilled,
      finalPostUnavailable: true,
    },
    safety: {
      publishAction: 'dry_run',
      metricoolCalls: false,
      n8nCalls: false,
      tiktokPublishApiCalls: false,
      marksPublished: false,
      clicksFinalPost: false,
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
