import { execFile } from 'node:child_process'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import assert from 'node:assert/strict'

import {
  acquireLocalSourceForClipPrep,
  renderLocalClipPrepVerticalAsset,
  renderLocalClipPrepForCandidateOrPackage,
  validateLocalSourceMp4,
} from '../lib/local-render-prep'

const execFileAsync = promisify(execFile)

type Row = Record<string, unknown>
type TableName = 'clip_candidates' | 'mac_mini_clip_packages'

class MemoryQuery {
  private filters: Array<{ key: string; value: unknown }> = []
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

  update(payload: Row) {
    this.updatePayload = payload
    return this
  }

  private rows(): Row[] {
    return this.db.rows(this.table)
      .filter((row) => this.filters.every((filter) => row[filter.key] === filter.value))
  }

  async maybeSingle() {
    const row = this.rows()[0] ?? null
    return { data: row, error: null }
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
    assert.ok(table === 'clip_candidates' || table === 'mac_mini_clip_packages', `Unexpected table access: ${table}`)
    return new MemoryQuery(this, table)
  }

  rows(table: TableName) {
    return this.tables[table]
  }
}

function clipPrepFixture(input: { start: number | null; end: number | null }) {
  const length = input.start !== null && input.end !== null ? input.end - input.start : null
  return {
    version: 'rbhq-clip-prep-v1',
    status: input.start !== null && input.end !== null ? 'ready' : 'metadata_only',
    confidence: input.start !== null && input.end !== null ? 'high' : 'low',
    suggested_clip_start_seconds: input.start,
    suggested_clip_end_seconds: input.end,
    suggested_clip_length_seconds: length,
    clip_reason: 'Smoke local render prep reason.',
    opening_text: 'Smoke opening.',
    edit_notes: ['Suggested manual cut from smoke fixture.'],
    asset_instructions: 'No automated download. Use local source MP4 only.',
    basis: {
      transcript_available: true,
      timed_transcript_available: true,
      transcript_source: 'fixture',
      source_title: 'Smoke source',
      source_name: 'Smoke',
      published_at: '2026-07-09T12:00:00.000Z',
      intelligence: {
        score: 91,
        rankLabel: 'must_post',
        urgency: 'post_now',
        reasons: ['Smoke reason.'],
        whyNow: 'Smoke now.',
      },
    },
    safety: {
      downloads_video: false,
      renders_video: false,
      uploads_video: false,
      posts_video: false,
    },
  }
}

function packagePayload(packageId: string, candidateId: string) {
  return {
    version: 'rbhq-mac-mini-clip-package-v1',
    targetPlatform: 'tiktok',
    publishAction: 'dry_run',
    testMode: true,
    packageId,
    candidateId,
    lane: {
      label: 'RB Sports',
      slug: 'sports',
      browserChannelKey: 'rb_sports',
      targetChannelId: 'a1000000-0000-0000-0000-000000000001',
    },
    source: {
      url: '/tmp/local-source.mp4',
      title: 'Smoke source',
      name: 'Smoke',
    },
    localAssetPath: null,
    asset: {
      localPath: null,
      status: 'missing',
      error: null,
    },
    clipPrep: clipPrepFixture({ start: 1, end: 3 }),
    tiktokDraft: {
      title: 'Smoke source',
      hook: 'Smoke opening',
      caption: 'Smoke caption',
      hashtags: ['#Smoke'],
      sourceVideoUrl: '/tmp/local-source.mp4',
      mediaPath: null,
      localPath: null,
      whyNow: 'Smoke now.',
      operatorSummary: 'Smoke summary.',
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

function packageRow(packageId: string, candidateId: string): Row {
  return {
    id: packageId,
    clip_candidate_id: candidateId,
    ingested_video_id: 'video-smoke',
    target_channel_id: 'a1000000-0000-0000-0000-000000000001',
    lane_label: 'RB Sports',
    lane_slug: 'sports',
    browser_channel_key: 'rb_sports',
    source_url: '/tmp/local-source.mp4',
    source_title: 'Smoke source',
    source_name: 'Smoke',
    caption: 'Smoke caption',
    hashtags: ['#Smoke'],
    why_now: 'Smoke now.',
    hook: 'Smoke opening',
    operator_summary: 'Smoke summary.',
    edit_notes: ['Dry-run only: local browser worker must not click final TikTok Post.'],
    score: 91,
    package_payload: packagePayload(packageId, candidateId),
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

async function createSourceVideo(sourcePath: string) {
  await mkdir(path.dirname(sourcePath), { recursive: true })
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x240:rate=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=44100',
      '-t',
      '5',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      sourcePath,
    ],
    { maxBuffer: 1024 * 1024 * 10 },
  )
}

async function probeMp4(filePath: string) {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=index,codec_type,codec_name,width,height,duration',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      filePath,
    ],
    { maxBuffer: 1024 * 1024 * 2 },
  )
  return JSON.parse(String(stdout)) as {
    streams?: Array<{
      codec_type?: string
      codec_name?: string
      width?: number
      height?: number
      duration?: string
    }>
    format?: { duration?: string }
  }
}

async function main() {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error('Smoke test forbids network calls.')
  }) as typeof fetch

  const root = path.join(process.cwd(), 'tmp', 'local-render-prep-smoke')
  const sourceDir = path.join(process.cwd(), 'tmp', 'local-render-prep-source')
  const sourcePath = path.join(sourceDir, 'source.mp4')

  try {
    await rm(root, { recursive: true, force: true })
    await rm(sourceDir, { recursive: true, force: true })
    await createSourceVideo(sourcePath)

    const candidateId = 'candidate-local-render-smoke'
    const packageId = 'package-local-render-smoke'
    const db = new MemorySupabase({
      clip_candidates: [
        {
          id: candidateId,
          title: 'Smoke source',
          clip_prep: clipPrepFixture({ start: 1, end: 3 }),
          score_breakdown: null,
          suggested_clip_start_seconds: 1,
          suggested_clip_end_seconds: 3,
          suggested_clip_length_seconds: 2,
        },
        {
          id: 'candidate-missing-timing',
          title: 'Missing timing',
          clip_prep: clipPrepFixture({ start: null, end: null }),
          score_breakdown: null,
          suggested_clip_start_seconds: null,
          suggested_clip_end_seconds: null,
          suggested_clip_length_seconds: null,
        },
      ],
      mac_mini_clip_packages: [packageRow(packageId, candidateId)],
    })

    const localSource = await acquireLocalSourceForClipPrep(db as never, {
      packageId,
      sourcePath,
      assetRoot: root,
    })
    assert.equal(localSource.status, 'render_ready')
    assert.equal(localSource.sourcePath, sourcePath)
    assert.equal(localSource.sourceDownloaded, false)
    assert.ok(localSource.tools.some((tool) => tool.name === 'yt-dlp'))
    assert.ok(localSource.tools.some((tool) => tool.name === 'ffmpeg'))
    assert.ok(localSource.tools.some((tool) => tool.name === 'ffprobe'))

    const urlSource = await acquireLocalSourceForClipPrep(db as never, {
      packageId,
      sourceUrl: 'https://example.com/source.mp4',
      assetRoot: root,
    })
    assert.equal(urlSource.status, 'source_missing')
    assert.equal(urlSource.sourcePath, null)
    assert.equal(urlSource.sourceDownloaded, false)
    assert.match(urlSource.error ?? '', /download is manual-only/)

    const rendered = await renderLocalClipPrepForCandidateOrPackage(db as never, {
      packageId,
      sourcePath,
      assetRoot: root,
      attach: true,
      now: () => new Date('2026-07-09T12:30:00.000Z'),
    })
    const renderedStat = await stat(rendered.outputPath)
    assert.equal(rendered.status, 'rendered')
    assert.equal(rendered.packageId, packageId)
    assert.equal(rendered.candidateId, candidateId)
    assert.equal(rendered.startSeconds, 1)
    assert.equal(rendered.endSeconds, 3)
    assert.equal(rendered.durationSeconds, 2)
    assert.ok(rendered.outputPath.startsWith(root))
    assert.ok(rendered.outputPath.endsWith('.mp4'))
    assert.ok(renderedStat.size > 0)
    assert.equal(rendered.attached, true)
    assert.equal(rendered.attachedPackage?.assetStatus, 'attached')
    assert.equal(db.rows('mac_mini_clip_packages')[0]?.local_asset_path, rendered.outputPath)
    assert.equal((db.rows('mac_mini_clip_packages')[0]?.package_payload as Record<string, unknown>)?.localAssetPath, rendered.outputPath)

    const vertical = await renderLocalClipPrepVerticalAsset({
      sourcePath: rendered.outputPath,
      assetRoot: root,
      packageId,
    })
    const verticalProbe = await probeMp4(vertical.outputPath)
    const verticalVideo = verticalProbe.streams?.find((stream) => stream.codec_type === 'video')
    const verticalAudio = verticalProbe.streams?.find((stream) => stream.codec_type === 'audio')
    assert.equal(vertical.layout, 'vertical-blur')
    assert.equal(vertical.durationMode, 'source')
    assert.equal(verticalVideo?.codec_name, 'h264')
    assert.equal(verticalVideo?.width, 1080)
    assert.equal(verticalVideo?.height, 1920)
    assert.equal(verticalAudio?.codec_name, 'aac')
    assert.ok(Math.abs(Number(verticalProbe.format?.duration ?? 0) - rendered.durationSeconds) < 0.25)
    assert.ok(vertical.outputPath.startsWith(root))
    assert.match(path.basename(vertical.outputPath), /vertical-1080x1920\.mp4$/)

    await assert.rejects(
      () => validateLocalSourceMp4('https://example.com/source.mp4'),
      /refuses URL sources/,
    )
    await assert.rejects(
      () => renderLocalClipPrepForCandidateOrPackage(db as never, {
        packageId,
        sourceUrl: 'https://example.com/source.mp4',
        assetRoot: root,
      }),
      /source_missing/,
    )
    await assert.rejects(
      () => renderLocalClipPrepForCandidateOrPackage(db as never, {
        candidateId: 'candidate-missing-timing',
        sourcePath,
        assetRoot: root,
      }),
      /requires suggested_clip_start_seconds and suggested_clip_end_seconds/,
    )
    await assert.rejects(
      () => renderLocalClipPrepForCandidateOrPackage(db as never, {
        packageId,
        sourcePath,
        assetRoot: root,
        outputDir: path.join(process.cwd(), 'tmp', 'outside-local-render-prep-smoke'),
      }),
      /output directory must stay inside/,
    )
    assert.equal(fetchCalls, 0)

    console.log(JSON.stringify({
      result: 'PASS',
      render: {
        packageId: rendered.packageId,
        candidateId: rendered.candidateId,
        outputPath: rendered.outputPath,
        assetRoot: rendered.assetRoot,
        startSeconds: rendered.startSeconds,
        endSeconds: rendered.endSeconds,
        durationSeconds: rendered.durationSeconds,
        sizeBytes: rendered.sizeBytes,
        attached: rendered.attached,
        attachedAssetStatus: rendered.attachedPackage?.assetStatus ?? null,
        verticalOutputPath: vertical.outputPath,
        verticalDurationSeconds: vertical.durationSeconds,
      },
      validations: {
        localSourceStatus: localSource.status,
        urlSourceStatus: urlSource.status,
        rejectsUrlSource: true,
        rejectsUrlRenderWithoutDownloadFlag: true,
        rejectsMissingTiming: true,
        rejectsOutsideOutputDir: true,
        outputInsideAssetRoot: rendered.outputPath.startsWith(root),
        verticalCodec: verticalVideo?.codec_name,
        verticalAudioCodec: verticalAudio?.codec_name,
        verticalResolution: `${verticalVideo?.width}x${verticalVideo?.height}`,
        verticalPreservesDuration: Math.abs(Number(verticalProbe.format?.duration ?? 0) - rendered.durationSeconds) < 0.25,
        sourceMustBeLocalMp4: true,
      },
      safety: {
        networkCalls: fetchCalls,
        downloadsVideo: false,
        uploadsVideo: false,
        postsVideo: false,
        clicksFinalPost: false,
        livePublish: false,
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
