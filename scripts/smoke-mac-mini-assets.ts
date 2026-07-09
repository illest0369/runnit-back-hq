import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  attachMacMiniLocalAsset,
  type MacMiniClipPackagePayload,
} from '../lib/mac-mini-handoff'
import { runMacMiniDryRunWorker } from '../lib/mac-mini-dry-run-worker'

type Row = Record<string, unknown>

class MemoryQuery {
  private filters: Array<{ key: string; value: unknown }> = []
  private updatePayload: Row | null = null

  constructor(private readonly db: MemorySupabase) {}

  select() {
    return this
  }

  eq(key: string, value: unknown) {
    this.filters.push({ key, value })
    return this
  }

  update(payload: Row) {
    this.updatePayload = payload
    return this
  }

  private rows(): Row[] {
    return this.db.rows.filter((row) => this.filters.every((filter) => row[filter.key] === filter.value))
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
  constructor(readonly rows: Row[]) {}

  from(table: string) {
    assert.equal(table, 'mac_mini_clip_packages')
    return new MemoryQuery(this)
  }
}

function clipPrepFixture() {
  return {
    version: 'rbhq-clip-prep-v1' as const,
    status: 'ready' as const,
    confidence: 'high' as const,
    suggested_clip_start_seconds: 4,
    suggested_clip_end_seconds: 19,
    suggested_clip_length_seconds: 15,
    clip_reason: 'RB Sports has breaking/news momentum; 0-3 hour viral window.',
    opening_text: 'Fans are losing it after the final play',
    edit_notes: ['Suggested manual cut: 4s-19s (15s).'],
    asset_instructions: 'Manually provide a local MP4 asset, then cut 4s-19s after human review. No automated download or render is performed.',
    basis: {
      transcript_available: true,
      timed_transcript_available: true,
      transcript_source: 'fixture-timed-transcript',
      source_title: 'ESPN trade reaction source video',
      source_name: 'ESPN',
      published_at: '2026-07-09T12:00:00.000Z',
      intelligence: {
        score: 92,
        rankLabel: 'must_post' as const,
        urgency: 'post_now' as const,
        reasons: ['Freshness signal: use the 0-3 hour posting window.'],
        whyNow: 'RB Sports has breaking/news momentum; 0-3 hour viral window.',
      },
    },
    safety: {
      downloads_video: false as const,
      renders_video: false as const,
      uploads_video: false as const,
      posts_video: false as const,
    },
  }
}

function packagePayload(packageId: string): MacMiniClipPackagePayload {
  return {
    version: 'rbhq-mac-mini-clip-package-v1',
    targetPlatform: 'tiktok',
    publishAction: 'dry_run',
    testMode: true,
    packageId,
    candidateId: `candidate-${packageId}`,
    lane: {
      label: 'RB Sports',
      slug: 'sports',
      browserChannelKey: 'rb_sports',
      targetChannelId: 'a1000000-0000-0000-0000-000000000001',
    },
    source: {
      url: 'https://www.youtube.com/watch?v=MACMINIASSET',
      title: 'ESPN trade reaction source video',
      name: 'ESPN',
    },
    localAssetPath: null,
    asset: {
      localPath: null,
      status: 'missing',
      error: null,
    },
    clipPrep: clipPrepFixture(),
    tiktokDraft: {
      title: 'ESPN trade reaction source video',
      hook: 'Fans are losing it after the final play',
      caption: 'Fans are losing it after the final play.',
      hashtags: ['#NBA', '#Breaking', '#RunnitBack'],
      sourceVideoUrl: 'https://www.youtube.com/watch?v=MACMINIASSET',
      mediaPath: null,
      localPath: null,
      whyNow: 'RB Sports has breaking/news momentum; 0-3 hour viral window.',
      operatorSummary: 'RB Sports package is ready for Mac mini dry-run.',
      editNotes: ['Dry-run only: local browser worker must not click final TikTok Post.'],
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
    createdAt: '2026-07-09T12:00:00.000Z',
  }
}

function packageRow(packageId: string): Row {
  return {
    id: packageId,
    clip_candidate_id: `candidate-${packageId}`,
    ingested_video_id: `video-${packageId}`,
    target_channel_id: 'a1000000-0000-0000-0000-000000000001',
    lane_label: 'RB Sports',
    lane_slug: 'sports',
    browser_channel_key: 'rb_sports',
    source_url: 'https://www.youtube.com/watch?v=MACMINIASSET',
    source_title: 'ESPN trade reaction source video',
    source_name: 'ESPN',
    caption: 'Fans are losing it after the final play.',
    hashtags: ['#NBA', '#Breaking', '#RunnitBack'],
    why_now: 'RB Sports has breaking/news momentum; 0-3 hour viral window.',
    hook: 'Fans are losing it after the final play',
    operator_summary: 'RB Sports package is ready for Mac mini dry-run.',
    edit_notes: ['Dry-run only: local browser worker must not click final TikTok Post.'],
    score: 92,
    package_payload: packagePayload(packageId),
    package_status: 'ready',
    handoff_status: 'pending',
    worker_id: null,
    fetched_at: null,
    dry_run_at: null,
    dry_run_error: null,
    local_asset_path: null,
    asset_status: 'missing',
    asset_error: null,
    asset_attached_at: null,
    created_at: '2026-07-09T12:00:00.000Z',
    updated_at: '2026-07-09T12:00:00.000Z',
  }
}

function apiPackage(row: Row) {
  const payload = row.package_payload as MacMiniClipPackagePayload
  return {
    id: row.id,
    browserChannelKey: row.browser_channel_key,
    localAssetPath: row.local_asset_path,
    assetStatus: row.asset_status,
    assetError: row.asset_error,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    caption: row.caption,
    hashtags: row.hashtags,
    hook: row.hook,
    whyNow: row.why_now,
    operatorSummary: row.operator_summary,
    editNotes: row.edit_notes,
    payload,
  }
}

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function runWorkerAgainst(row: Row, input: { stageUpload?: boolean } = {}) {
  const recordedRequests: Array<{ method: string; body: Record<string, unknown> | null }> = []
  const uploaderCalls: string[][] = []
  const fetchFn = (async (url, init) => {
    const requestUrl = String(url)
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null
    recordedRequests.push({ method, body })
    if (requestUrl.includes('/api/mac-mini/packages?')) {
      return responseJson({ ok: true, data: [apiPackage(row)] })
    }
    if (requestUrl.includes(`/api/mac-mini/packages/${String(row.id)}/dry-run`)) {
      return responseJson({ ok: true, data: { id: row.id } })
    }
    return responseJson({ ok: false, error: `Unexpected URL ${requestUrl}` }, 404)
  }) as typeof fetch

  const runUploader = async (args: string[]) => {
    uploaderCalls.push(args)
    if (args.includes('--print-profile')) {
      return {
        stdout: JSON.stringify({
          result: 'PASS',
          channelKey: 'rb_sports',
          profileDir: path.join(process.cwd(), 'tmp/browser-profiles/tiktok-rb-sports'),
          safety: { clicksFinalPost: false },
        }),
        stderr: '',
      }
    }

    return {
      stdout: JSON.stringify({
        result: 'READY',
        blocker: null,
        channelKey: 'rb_sports',
        staging: {
          requested: Boolean(input.stageUpload),
          uploadStaged: Boolean(input.stageUpload),
          captionFilled: Boolean(input.stageUpload),
          stoppedBeforeFinalPost: true,
          manualApprovalRequired: true,
        },
        safety: {
          usesTikTokApi: false,
          storesTikTokCredentialsInRbhq: false,
          marksRbhqPublished: false,
          clicksFinalPost: false,
        },
      }),
      stderr: '',
    }
  }

  const result = await runMacMiniDryRunWorker({
    baseUrl: 'https://rbhq.test',
    token: 'worker-token',
    workerId: 'mac-mini-asset-smoke',
    stageUpload: input.stageUpload,
    keepDraft: true,
  }, { fetchFn, runUploader })

  return { result, recordedRequests, uploaderCalls }
}

async function main() {
  const assetRoot = path.join(process.cwd(), 'tmp', 'mac-mini-assets-smoke')
  await mkdir(assetRoot, { recursive: true })
  const validAssetPath = path.join(assetRoot, 'candidate.mp4')
  await writeFile(validAssetPath, Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]))

  const rows = [
    packageRow('missing-package'),
    packageRow('valid-package'),
    packageRow('invalid-package'),
  ]
  const db = new MemorySupabase(rows)

  const missingWorker = await runWorkerAgainst(rows[0])
  assert.equal(missingWorker.result.mode, 'metadata_only')
  assert.equal(missingWorker.result.assetMissing, true)
  const missingRecord = missingWorker.recordedRequests.find((request) => request.method === 'POST')
  assert.equal((missingRecord?.body?.result as Record<string, unknown>)?.asset_missing, true)

  const attached = await attachMacMiniLocalAsset(db as never, 'valid-package', validAssetPath, {
    assetRoot,
    now: () => new Date('2026-07-09T12:10:00.000Z'),
  })
  assert.equal(attached.localAssetPath, validAssetPath)
  assert.equal(attached.assetStatus, 'attached')
  assert.equal(attached.assetError, null)
  assert.equal(attached.payload.localAssetPath, validAssetPath)
  assert.equal(attached.payload.tiktokDraft.mediaPath, validAssetPath)

  const outsidePath = path.join(process.cwd(), 'tmp', 'outside-mac-mini-assets', 'bad.mp4')
  await mkdir(path.dirname(outsidePath), { recursive: true })
  await writeFile(outsidePath, Buffer.from([0, 0, 0, 24]))
  await assert.rejects(
    () => attachMacMiniLocalAsset(db as never, 'invalid-package', outsidePath, { assetRoot }),
    /Local asset path must be inside/,
  )
  assert.equal(rows[2]?.asset_status, 'invalid')
  assert.ok(String(rows[2]?.asset_error).includes('Local asset path must be inside'))

  const dryRun = await runWorkerAgainst(rows[1], { stageUpload: true })
  assert.equal(dryRun.result.mode, 'browser_dry_run')
  assert.equal(dryRun.result.assetMissing, false)
  assert.equal(dryRun.result.safety.clicksFinalPost, false)
  assert.ok(dryRun.uploaderCalls[1]?.includes('--stage-upload'))
  const dryRunRecord = dryRun.recordedRequests.find((request) => request.method === 'POST')
  const dryRunResult = dryRunRecord?.body?.result as Record<string, unknown>
  const uploaderResult = dryRunResult.uploaderResult as Record<string, unknown>
  const staging = uploaderResult.staging as Record<string, unknown>
  const safety = uploaderResult.safety as Record<string, unknown>
  assert.equal(dryRunRecord?.body?.status, 'success')
  assert.equal(dryRunResult.asset_missing, false)
  assert.equal(dryRunResult.local_asset_path, validAssetPath)
  assert.equal(staging.stoppedBeforeFinalPost, true)
  assert.equal(safety.clicksFinalPost, false)

  console.log(JSON.stringify({
    result: 'PASS',
    missingAsset: {
      mode: missingWorker.result.mode,
      assetMissing: missingWorker.result.assetMissing,
      dryRunRecorded: missingWorker.result.dryRunRecorded,
    },
    validAttach: {
      packageId: attached.id,
      localAssetPath: attached.localAssetPath,
      assetStatus: attached.assetStatus,
      payloadMediaPath: attached.payload.tiktokDraft.mediaPath,
    },
    invalidAttach: {
      packageId: rows[2]?.id,
      assetStatus: rows[2]?.asset_status,
      assetError: rows[2]?.asset_error,
    },
    dryRun: {
      mode: dryRun.result.mode,
      assetMissing: dryRun.result.assetMissing,
      stoppedBeforeFinalPost: staging.stoppedBeforeFinalPost,
      clicksFinalPost: safety.clicksFinalPost,
    },
    safety: {
      livePosting: false,
      metricoolCalls: false,
      tiktokPublishCalls: false,
      finalPostClicks: false,
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
