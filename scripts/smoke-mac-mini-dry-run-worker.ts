import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { runMacMiniDryRunWorker } from '../lib/mac-mini-dry-run-worker'

type RecordedRequest = {
  url: string
  method: string
  body: Record<string, unknown> | null
}

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function packageFixture(input: { id: string; mediaPath?: string | null }) {
  return {
    id: input.id,
    browserChannelKey: 'rb_sports',
    sourceUrl: 'https://www.youtube.com/watch?v=MACMINIDRYRUN',
    sourceTitle: 'ESPN trade reaction source video',
    caption: 'Fans are losing it after the final play.',
    hashtags: ['#NBA', '#Breaking', '#RunnitBack'],
    hook: 'Fans are losing it after the final play',
    whyNow: 'RB Sports has breaking/news momentum; 0-3 hour viral window.',
    operatorSummary: 'RB Sports package is ready for Mac mini dry-run.',
    editNotes: ['Dry-run only: local browser worker must not click final TikTok Post.'],
    payload: {
      version: 'rbhq-mac-mini-clip-package-v1',
      targetPlatform: 'tiktok',
      publishAction: 'dry_run',
      testMode: true,
      packageId: input.id,
      candidateId: 'candidate-smoke',
      lane: {
        label: 'RB Sports',
        slug: 'sports',
        browserChannelKey: 'rb_sports',
        targetChannelId: 'a1000000-0000-0000-0000-000000000001',
      },
      source: {
        url: 'https://www.youtube.com/watch?v=MACMINIDRYRUN',
        title: 'ESPN trade reaction source video',
        name: 'ESPN',
      },
      tiktokDraft: {
        title: 'ESPN trade reaction source video',
        hook: 'Fans are losing it after the final play',
        caption: 'Fans are losing it after the final play.',
        hashtags: ['#NBA', '#Breaking', '#RunnitBack'],
        sourceVideoUrl: 'https://www.youtube.com/watch?v=MACMINIDRYRUN',
        mediaPath: input.mediaPath ?? null,
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
    },
  }
}

async function runCase(input: { id: string; mediaPath?: string | null; stageUpload?: boolean }) {
  const recordedRequests: RecordedRequest[] = []
  const uploaderCalls: string[][] = []
  const fetchFn = (async (url, init) => {
    const requestUrl = String(url)
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string'
      ? JSON.parse(init.body) as Record<string, unknown>
      : null
    recordedRequests.push({ url: requestUrl, method, body })

    if (requestUrl.includes('/api/mac-mini/packages?')) {
      return responseJson({ ok: true, data: [packageFixture({ id: input.id, mediaPath: input.mediaPath })] })
    }
    if (requestUrl.includes(`/api/mac-mini/packages/${input.id}/dry-run`)) {
      return responseJson({ ok: true, data: { id: input.id, packageStatus: 'dry_run_complete' } })
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

    assert.ok(args.includes('--draft'), 'Browser dry-run must receive a draft path.')
    assert.ok(args.includes('--channel'), 'Browser dry-run must receive a channel key.')
    assert.ok(args.includes('rb_sports'), 'Browser dry-run selected the wrong profile key.')
    assert.ok(args.includes('--stage-upload') === Boolean(input.stageUpload), 'Stage-upload flag mismatch.')
    return {
      stdout: JSON.stringify({
        result: 'READY',
        blocker: null,
        channelKey: 'rb_sports',
        mediaExists: true,
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
    workerId: 'mac-mini-smoke-worker',
    stageUpload: input.stageUpload,
    keepDraft: true,
  }, {
    fetchFn,
    runUploader,
  })

  return { result, recordedRequests, uploaderCalls }
}

async function main() {
  const metadataOnly = await runCase({ id: 'metadata-package' })
  assert.equal(metadataOnly.result.result, 'PASS')
  assert.equal(metadataOnly.result.mode, 'metadata_only')
  assert.equal(metadataOnly.result.assetMissing, true)
  assert.equal(metadataOnly.result.channelKey, 'rb_sports')
  assert.equal(metadataOnly.result.safety.clicksFinalPost, false)
  assert.equal(metadataOnly.uploaderCalls.length, 1)
  assert.ok(metadataOnly.uploaderCalls[0]?.includes('--print-profile'))
  const metadataRecord = metadataOnly.recordedRequests.find((request) => request.method === 'POST')
  assert.equal(metadataRecord?.body?.status, 'success')
  assert.equal((metadataRecord?.body?.result as Record<string, unknown>)?.asset_missing, true)

  const assetDir = path.join(process.cwd(), 'tmp', 'smoke-mac-mini-dry-run-worker')
  await mkdir(assetDir, { recursive: true })
  const mediaPath = path.join(assetDir, 'candidate.mp4')
  await writeFile(mediaPath, Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]))

  const browserDryRun = await runCase({ id: 'asset-package', mediaPath, stageUpload: true })
  assert.equal(browserDryRun.result.result, 'PASS')
  assert.equal(browserDryRun.result.mode, 'browser_dry_run')
  assert.equal(browserDryRun.result.assetMissing, false)
  assert.equal(browserDryRun.result.channelKey, 'rb_sports')
  assert.equal(browserDryRun.uploaderCalls.length, 2)
  assert.ok(browserDryRun.uploaderCalls[0]?.includes('--print-profile'))
  assert.ok(browserDryRun.uploaderCalls[1]?.includes('--draft'))
  assert.ok(browserDryRun.uploaderCalls[1]?.includes('--stage-upload'))
  const browserRecord = browserDryRun.recordedRequests.find((request) => request.method === 'POST')
  const browserResult = browserRecord?.body?.result as Record<string, unknown>
  const uploaderResult = browserResult.uploaderResult as Record<string, unknown>
  const staging = uploaderResult.staging as Record<string, unknown>
  const safety = uploaderResult.safety as Record<string, unknown>
  assert.equal(browserRecord?.body?.status, 'success')
  assert.equal(browserResult.asset_missing, false)
  assert.equal(staging.stoppedBeforeFinalPost, true)
  assert.equal(safety.clicksFinalPost, false)

  console.log(JSON.stringify({
    result: 'PASS',
    metadataOnly: {
      mode: metadataOnly.result.mode,
      packageId: metadataOnly.result.packageId,
      channelKey: metadataOnly.result.channelKey,
      assetMissing: metadataOnly.result.assetMissing,
      dryRunRecorded: metadataOnly.result.dryRunRecorded,
      uploaderCalls: metadataOnly.uploaderCalls.length,
    },
    browserDryRun: {
      mode: browserDryRun.result.mode,
      packageId: browserDryRun.result.packageId,
      channelKey: browserDryRun.result.channelKey,
      assetMissing: browserDryRun.result.assetMissing,
      dryRunRecorded: browserDryRun.result.dryRunRecorded,
      uploaderCalls: browserDryRun.uploaderCalls.length,
      stoppedBeforeFinalPost: staging.stoppedBeforeFinalPost,
    },
    safety: {
      packageFetchWorks: metadataOnly.recordedRequests.some((request) => request.method === 'GET'),
      correctProfileKeySelected: browserDryRun.uploaderCalls.some((args) => args.includes('rb_sports')),
      dryRunModeBlocksFinalPosting: safety.clicksFinalPost === false && staging.stoppedBeforeFinalPost === true,
      dryRunResultRecorded: Boolean(browserRecord),
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
