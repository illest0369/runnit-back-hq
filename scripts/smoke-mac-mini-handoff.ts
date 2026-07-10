import assert from 'node:assert/strict'

import {
  createMacMiniClipPackageFromCandidate,
  getPendingMacMiniClipPackages,
  recordMacMiniPackageDryRun,
} from '../lib/mac-mini-handoff'

type Row = Record<string, unknown>
type TableName = 'clip_candidates' | 'mac_mini_clip_packages'

class MemoryQuery {
  private filters: Array<{ key: string; value: unknown }> = []
  private inFilters: Array<{ key: string; values: unknown[] }> = []
  private limitCount: number | null = null
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

  in(key: string, values: unknown[]) {
    this.inFilters.push({ key, values })
    return this
  }

  order() {
    return this
  }

  limit(count: number) {
    this.limitCount = count
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
    return this.db.rows(this.table)
      .filter((row) => this.filters.every((filter) => row[filter.key] === filter.value))
      .filter((row) => this.inFilters.every((filter) => filter.values.includes(row[filter.key])))
      .slice(0, this.limitCount ?? undefined)
  }

  async maybeSingle() {
    const row = this.rows()[0] ?? null
    return { data: row, error: null }
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

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    if (this.updatePayload) {
      for (const row of this.rows()) {
        Object.assign(row, this.updatePayload)
      }
    }
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected)
  }
}

class MemorySupabase {
  private readonly tables: Record<TableName, Row[]>

  constructor(input: Record<TableName, Row[]>) {
    this.tables = input
  }

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
  const now = new Date('2026-07-09T12:00:00.000Z')
  let fetchCalls = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error('Smoke test forbids network handoff calls.')
  }) as typeof fetch

  try {
    const freshPublishedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const candidateId = '11111111-1111-4111-8111-111111111111'
    const packageId = '22222222-2222-4222-8222-222222222222'
    const db = new MemorySupabase({
      clip_candidates: [
        {
          id: candidateId,
          ingested_video_id: '33333333-3333-4333-8333-333333333333',
          target_channel_id: 'a1000000-0000-0000-0000-000000000001',
          start_seconds: 4,
          end_seconds: 19,
          title: 'Breaking trade reaction after clutch playoff upset',
          summary: 'STALE operator summary',
          hook_text: 'Fans are losing it after the final play',
          caption: 'STALE CAPTION',
          hashtags: ['#StaleTag'],
          score: 10,
          score_breakdown: {
            model: 'stale_fixture',
            rankLabel: 'low_priority',
            urgency: 'hold',
            whyNow: 'STALE why now',
            operatorSummary: 'STALE operator summary',
            reasons: ['STALE reason'],
          },
          status: 'approved_for_handoff',
          ingested_videos: {
            id: '33333333-3333-4333-8333-333333333333',
            title: 'ESPN trade reaction source video',
            description: 'Breaking trade reaction after a clutch playoff upset has fans losing it.',
            platform: 'youtube',
            video_url: 'https://www.youtube.com/watch?v=MACMINISMOKE',
            published_at: freshPublishedAt,
            duration_seconds: 180,
            source_channels: {
              display_name: 'ESPN',
              target_rbhq_channel_id: 'a1000000-0000-0000-0000-000000000001',
            },
          },
        },
      ],
      mac_mini_clip_packages: [],
    })

    const created = await createMacMiniClipPackageFromCandidate(db as never, candidateId, {
      now: () => now,
      packageId,
    })
    assert.equal(created.id, packageId)
    assert.equal(created.packageStatus, 'ready')
    assert.equal(created.handoffStatus, 'pending')
    assert.equal(created.browserChannelKey, 'rb_sports')
    assert.equal(created.payload.publishAction, 'dry_run')
    assert.equal(created.payload.testMode, true)
    assert.equal(created.payload.safety.livePostingAllowed, false)
    assert.equal(created.payload.safety.metricoolAllowed, false)
    assert.equal(created.payload.safety.finalPostClickAllowed, false)
    assert.equal(created.sourceUrl, 'https://www.youtube.com/watch?v=MACMINISMOKE')
    assert.notEqual(created.caption, 'STALE CAPTION')
    assert.ok(created.caption.includes('Quick review:'))
    assert.ok(created.hashtags.some((tag) => tag.toLowerCase().includes('tradetalk')))
    assert.ok(created.score > 10)
    assert.ok(created.whyNow.includes('0-3 hour viral window'))
    assert.notEqual(created.operatorSummary, 'STALE operator summary')
    assert.ok(created.operatorSummary.includes('0-3 hour viral window'))
    assert.ok(created.editNotes.some((note) => note.includes('candidate_start_seconds:4')))

    const syncedCandidate = db.rows('clip_candidates')[0]
    assert.notEqual(syncedCandidate?.caption, 'STALE CAPTION')
    assert.ok(Array.isArray(syncedCandidate?.hashtags) && syncedCandidate.hashtags.length > 1)
    assert.ok(Number(syncedCandidate?.score) > 10)
    assert.equal((syncedCandidate?.score_breakdown as Record<string, unknown>)?.model, 'rbhq_intelligence_v1')

    const pending = await getPendingMacMiniClipPackages(db as never, { limit: 5 })
    assert.equal(pending.length, 1)
    assert.equal(pending[0]?.id, packageId)
    assert.equal(pending[0]?.handoffStatus, 'pending')

    const dryRun = await recordMacMiniPackageDryRun(db as never, packageId, {
      status: 'success',
      workerId: 'mac-mini-smoke-worker',
      result: {
        uploadPageReady: true,
        stagedUpload: false,
        clickedFinalPost: false,
      },
      now: () => new Date('2026-07-09T12:05:00.000Z'),
    })
    assert.equal(dryRun.packageStatus, 'dry_run_complete')
    assert.equal(dryRun.handoffStatus, 'dry_run_succeeded')
    assert.equal(dryRun.workerId, 'mac-mini-smoke-worker')
    assert.equal(dryRun.dryRunError, null)

    const livePostRecord = await recordMacMiniPackageDryRun(db as never, packageId, {
      status: 'success',
      workerId: 'mac-mini-live-post-smoke-worker',
      result: {
        source: 'mac-mini-live-post-worker',
        packageId,
        uploaderResult: {
          result: 'POST_CONFIRMED',
          livePost: {
            requested: true,
            clickedFinalPost: true,
            status: 'posted',
            confirmation: 'confirmed',
          },
          safety: {
            clicksFinalPost: true,
            marksRbhqPublished: false,
          },
        },
      },
      now: () => new Date('2026-07-09T12:06:00.000Z'),
    })
    assert.equal(livePostRecord.packageStatus, 'dry_run_complete')
    assert.equal(livePostRecord.workerId, 'mac-mini-live-post-smoke-worker')
    assert.equal(fetchCalls, 0)

    console.log(JSON.stringify(
      {
        result: 'PASS',
        createdPackage: {
          id: created.id,
          lane: created.laneLabel,
          browserChannelKey: created.browserChannelKey,
          packageStatus: created.packageStatus,
          handoffStatus: created.handoffStatus,
          sourceUrl: created.sourceUrl,
          caption: created.caption,
          hashtags: created.hashtags,
          whyNow: created.whyNow,
          hook: created.hook,
          operatorSummary: created.operatorSummary,
          editNotes: created.editNotes,
        },
        fetch: {
          pendingCount: pending.length,
          firstPackageId: pending[0]?.id ?? null,
        },
        dryRun: {
          packageStatus: dryRun.packageStatus,
          handoffStatus: dryRun.handoffStatus,
          workerId: dryRun.workerId,
          dryRunAt: dryRun.dryRunAt,
          livePostWorkerId: livePostRecord.workerId,
        },
        safety: {
          livePostingRequests: fetchCalls,
          metricoolCalls: false,
          tiktokUploads: false,
          livePublishStateSet: false,
        },
      },
      null,
      2,
    ))
  } finally {
    globalThis.fetch = originalFetch
  }
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
