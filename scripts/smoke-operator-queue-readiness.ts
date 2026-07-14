import assert from 'node:assert/strict'

import { createMacMiniClipPackageFromCandidate } from '../lib/mac-mini-handoff'
import {
  buildCandidateIntelligenceForQueue,
  buildQueueReadiness,
  extractCandidateIdFromNotes,
} from '../lib/operator-queue-readiness'

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

async function main() {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error('Smoke test forbids network calls.')
  }) as typeof fetch

  try {
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
    assert.equal(loginBlockedReadiness.tiktokStaging.operatorState, 'tiktok_login_blocked')
    assert.equal(loginBlockedReadiness.tiktokStaging.loginBlocked, true)
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
        tiktokLoginBlocked: loginBlockedReadiness.tiktokStaging.loginBlocked,
        prepCanContinue: loginBlockedReadiness.tiktokStaging.prepCanContinue,
        retryAfterAccessRestored: loginBlockedReadiness.tiktokStaging.retryAfterAccessRestored,
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
