import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { runBatchLocalClipGeneration } from './batch-local-clip-generation'

const execFileAsync = promisify(execFile)

type Row = Record<string, unknown>
type TableName = 'clip_candidates' | 'ingested_videos' | 'source_channels' | 'video_transcripts' | 'mac_mini_clip_packages'

class MemoryQuery {
  private filters: Array<{ key: string; value: unknown }> = []
  private notFilters: Array<{ key: string; value: unknown }> = []
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

  neq(key: string, value: unknown) {
    this.notFilters.push({ key, value })
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
      .filter((row) => this.notFilters.every((filter) => row[filter.key] !== filter.value))
      .filter((row) => this.inFilters.every((filter) => filter.values.includes(row[filter.key])))
      .slice(0, this.limitCount ?? undefined)
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
  constructor(private readonly tables: Record<TableName, Row[]>) {}

  from(table: string) {
    assert.ok(
      table === 'clip_candidates' ||
        table === 'ingested_videos' ||
        table === 'source_channels' ||
        table === 'video_transcripts' ||
        table === 'mac_mini_clip_packages',
      `Unexpected table access: ${table}`,
    )
    return new MemoryQuery(this, table)
  }

  rows(table: TableName) {
    return this.tables[table]
  }

  insert(table: TableName, row: Row) {
    this.tables[table].push(row)
  }
}

function clipPrepFixture(start: number, end: number) {
  return {
    version: 'rbhq-clip-prep-v1',
    status: 'ready',
    confidence: 'high',
    suggested_clip_start_seconds: start,
    suggested_clip_end_seconds: end,
    suggested_clip_length_seconds: Number((end - start).toFixed(3)),
    clip_reason: 'Smoke batch local render clip reason.',
    opening_text: 'Smoke batch opening.',
    caption_prep: {
      version: 'rbhq-caption-prep-v1',
      subtitle_source: 'transcript',
      suggested_on_screen_hook: 'Smoke batch opening.',
      first_two_second_opener_text: 'Smoke batch opening.',
      caption_safe_zone_notes: [
        'Keep subtitles clear of the top 250px, bottom 420px, and 80px side gutters in the 1080x1920 render.',
      ],
      suggested_subtitle_style: {
        preset: 'bold-lower-third',
        position: 'lower_third_caption_safe',
        max_lines: 2,
        burned_in: false,
      },
      transcript_segment_range: {
        start_seconds: start,
        end_seconds: end,
        text: 'Smoke batch opening.',
        segment_count: 1,
      },
      safety: {
        burned_in: false,
        uploads_video: false,
        posts_video: false,
      },
    },
    edit_notes: ['Smoke batch local render note.'],
    asset_instructions: 'Use local source MP4 only unless --download-source is passed.',
    basis: {
      transcript_available: true,
      timed_transcript_available: true,
      transcript_source: 'fixture',
      source_title: 'Smoke batch source',
      source_name: 'Smoke',
      published_at: '2026-07-14T12:00:00.000Z',
    },
    safety: {
      downloads_video: false,
      renders_video: false,
      uploads_video: false,
      posts_video: false,
    },
  }
}

function metadataOnlyClipPrepFixture(start: number, end: number) {
  const prep = clipPrepFixture(start, end)
  return {
    ...prep,
    confidence: 'low',
    caption_prep: {
      ...prep.caption_prep,
      subtitle_source: 'metadata_only',
      transcript_segment_range: null,
      transcript_segments: [],
    },
    basis: {
      ...prep.basis,
      transcript_available: false,
      timed_transcript_available: false,
      transcript_source: null,
    },
  }
}

function packagePayload(input: {
  packageId: string
  candidateId: string
  sourcePath: string
  start: number
  end: number
  staleMetadataOnly?: boolean
  targetChannelId?: string
}) {
  const prep = input.staleMetadataOnly
    ? metadataOnlyClipPrepFixture(input.start, input.end)
    : clipPrepFixture(input.start, input.end)
  return {
    version: 'rbhq-mac-mini-clip-package-v1',
    targetPlatform: 'tiktok',
    publishAction: 'dry_run',
    testMode: true,
    packageId: input.packageId,
    candidateId: input.candidateId,
    lane: {
      label: 'RB Sports',
      slug: 'sports',
      browserChannelKey: 'rb_sports',
      targetChannelId: input.targetChannelId ?? 'a1000000-0000-0000-0000-000000000001',
    },
    source: {
      url: input.sourcePath,
      title: 'Smoke batch source',
      name: 'Smoke',
    },
    localAssetPath: null,
    asset: {
      localPath: null,
      status: 'missing',
      error: null,
    },
    clipPrep: prep,
    tiktokDraft: {
      title: 'Smoke batch source',
      hook: prep.opening_text,
      caption: 'Smoke batch caption.',
      hashtags: ['#Smoke'],
      sourceVideoUrl: input.sourcePath,
      mediaPath: null,
      localPath: null,
      whyNow: 'Smoke batch now.',
      operatorSummary: 'Smoke batch summary.',
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
    createdAt: '2026-07-14T12:00:00.000Z',
  }
}

function packageRow(input: {
  packageId: string
  candidateId: string
  sourcePath: string
  assetStatus?: string
  localAssetPath?: string | null
  stagingStatus?: string
  staleMetadataOnly?: boolean
  targetChannelId?: string
}) {
  const targetChannelId = input.targetChannelId ?? 'a1000000-0000-0000-0000-000000000001'
  return {
    id: input.packageId,
    clip_candidate_id: input.candidateId,
    ingested_video_id: `video-${input.candidateId}`,
    target_channel_id: targetChannelId,
    lane_label: 'RB Sports',
    lane_slug: 'sports',
    browser_channel_key: 'rb_sports',
    source_url: input.sourcePath,
    source_title: 'Smoke batch source',
    source_name: 'Smoke',
    caption: 'Smoke batch caption.',
    hashtags: ['#Smoke'],
    why_now: 'Smoke batch now.',
    hook: 'Smoke batch opening.',
    operator_summary: 'Smoke batch summary.',
    edit_notes: ['Dry-run only: local browser worker must not click final TikTok Post.'],
    score: 91,
    package_payload: packagePayload({
      packageId: input.packageId,
      candidateId: input.candidateId,
      sourcePath: input.sourcePath,
      start: 1,
      end: 3,
      staleMetadataOnly: input.staleMetadataOnly,
      targetChannelId,
    }),
    package_status: 'ready',
    handoff_status: 'pending',
    worker_id: null,
    fetched_at: null,
    dry_run_at: null,
    dry_run_error: null,
    local_asset_path: input.localAssetPath ?? null,
    asset_status: input.assetStatus ?? 'missing',
    asset_error: null,
    asset_attached_at: null,
    tiktok_staging_status: input.stagingStatus ?? 'not_requested',
    tiktok_staging_requested_at: null,
    tiktok_staging_requested_by: null,
    tiktok_staging_at: null,
    tiktok_staging_error: null,
    created_at: '2026-07-14T12:00:00.000Z',
    updated_at: '2026-07-14T12:00:00.000Z',
  }
}

function candidateRow(input: {
  candidateId: string
  sourcePath: string
  status?: string
  clipPrepStatus?: string
  staleMetadataOnly?: boolean
  targetChannelId?: string
}) {
  const targetChannelId = input.targetChannelId ?? 'a1000000-0000-0000-0000-000000000001'
  const prep = input.staleMetadataOnly
    ? metadataOnlyClipPrepFixture(1, 3)
    : clipPrepFixture(1, 3)
  return {
    id: input.candidateId,
    ingested_video_id: `video-${input.candidateId}`,
    target_channel_id: targetChannelId,
    start_seconds: 1,
    end_seconds: 3,
    title: 'Smoke batch source',
    summary: 'Smoke batch summary.',
    hook_text: 'Smoke batch opening.',
    caption: 'Smoke batch caption.',
    hashtags: ['#Smoke'],
    score: 91,
    score_breakdown: {
      model: 'rbhq_intelligence_v1',
      rankLabel: 'must_post',
      urgency: 'post_now',
      whyNow: 'Smoke batch now.',
      operatorSummary: 'Smoke batch summary.',
      reasons: ['Smoke batch reason.'],
    },
    clip_prep: prep,
    suggested_clip_start_seconds: 1,
    suggested_clip_end_seconds: 3,
    suggested_clip_length_seconds: 2,
    clip_reason: prep.clip_reason,
    opening_text: prep.opening_text,
    edit_notes: prep.edit_notes,
    asset_instructions: prep.asset_instructions,
    clip_prep_status: input.clipPrepStatus ?? 'ready',
    clip_prep_confidence: 'high',
    status: input.status ?? 'approved_for_handoff',
    ingested_videos: {
      id: `video-${input.candidateId}`,
      title: 'Smoke batch source',
      description: 'Smoke batch source description.',
      platform: 'youtube',
      video_url: input.sourcePath,
      published_at: '2026-07-14T12:00:00.000Z',
      duration_seconds: 5,
      source_channels: {
        display_name: 'Smoke',
        target_rbhq_channel_id: targetChannelId,
      },
    },
  }
}

function videoRow(candidateId: string, sourcePath: string) {
  return {
    id: `video-${candidateId}`,
    source_channel_id: 'source-smoke',
    title: 'Smoke batch source',
    description: 'Smoke batch source description.',
    platform: 'youtube',
    video_url: sourcePath,
    published_at: '2026-07-14T12:00:00.000Z',
    duration_seconds: 5,
  }
}

function transcriptRow(candidateId: string) {
  return {
    id: `transcript-${candidateId}`,
    ingested_video_id: `video-${candidateId}`,
    transcript_source: 'fixture',
    transcript_text: 'Smoke batch opening. Strong follow-up line.',
    transcript_json: [
      { start: 1, duration: 1, end: 2, text: 'Smoke batch opening.' },
      { start: 2, duration: 1, end: 3, text: 'Strong follow-up line.' },
    ],
    language: 'en',
    created_at: '2026-07-14T12:00:00.000Z',
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

async function main() {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error('Smoke test forbids network calls.')
  }) as typeof fetch

  const root = path.join(process.cwd(), 'tmp', 'batch-local-clip-generation-smoke')
  const sourcePath = path.join(root, 'source.mp4')
  try {
    await rm(root, { recursive: true, force: true })
    await createSourceVideo(sourcePath)

    const db = new MemorySupabase({
      clip_candidates: [
        candidateRow({ candidateId: 'candidate-existing', sourcePath, staleMetadataOnly: true }),
        candidateRow({ candidateId: 'candidate-create', sourcePath }),
        candidateRow({ candidateId: 'candidate-url', sourcePath: 'https://example.com/source.mp4' }),
        candidateRow({ candidateId: 'candidate-manual-post', sourcePath }),
        candidateRow({
          candidateId: 'candidate-rb-women-only',
          sourcePath,
          clipPrepStatus: 'metadata_only',
          staleMetadataOnly: true,
          targetChannelId: 'a1000000-0000-0000-0000-000000000004',
        }),
        candidateRow({
          candidateId: 'candidate-other-lane-metadata-only',
          sourcePath,
          clipPrepStatus: 'metadata_only',
          staleMetadataOnly: true,
          targetChannelId: 'a1000000-0000-0000-0000-000000000001',
        }),
      ],
      ingested_videos: [
        videoRow('candidate-existing', sourcePath),
        videoRow('candidate-create', sourcePath),
        videoRow('candidate-url', 'https://example.com/source.mp4'),
        videoRow('candidate-manual-post', sourcePath),
        videoRow('candidate-rb-women-only', sourcePath),
        videoRow('candidate-other-lane-metadata-only', sourcePath),
      ],
      source_channels: [
        {
          id: 'source-smoke',
          display_name: 'Smoke',
          target_rbhq_channel_id: 'a1000000-0000-0000-0000-000000000001',
        },
      ],
      video_transcripts: [
        transcriptRow('candidate-existing'),
        transcriptRow('candidate-create'),
      ],
      mac_mini_clip_packages: [
        packageRow({ packageId: 'package-existing', candidateId: 'candidate-existing', sourcePath, staleMetadataOnly: true }),
        packageRow({ packageId: 'package-url', candidateId: 'candidate-url', sourcePath: 'https://example.com/source.mp4' }),
        packageRow({
          packageId: 'package-rb-women-only',
          candidateId: 'candidate-rb-women-only',
          sourcePath,
          staleMetadataOnly: true,
          targetChannelId: 'a1000000-0000-0000-0000-000000000004',
        }),
        packageRow({
          packageId: 'package-other-lane-metadata-only',
          candidateId: 'candidate-other-lane-metadata-only',
          sourcePath,
          staleMetadataOnly: true,
          targetChannelId: 'a1000000-0000-0000-0000-000000000001',
        }),
        packageRow({
          packageId: 'package-manual-post',
          candidateId: 'candidate-manual-post',
          sourcePath,
          assetStatus: 'attached',
          localAssetPath: sourcePath,
          stagingStatus: 'ready_for_manual_post',
        }),
      ],
    })

    const dryRun = await runBatchLocalClipGeneration(db as never, {
      limit: 3,
      assetRoot: root,
      attach: false,
      downloadSource: false,
      burnSubtitles: true,
      now: () => new Date('2026-07-14T12:30:00.000Z'),
    })
    assert.equal(dryRun.items.length, 3)
    assert.ok(!dryRun.items.some((item) => item.candidateId === 'candidate-other-lane-metadata-only'))
    assert.equal(dryRun.items[0]?.status, 'rendered')
    assert.equal(dryRun.items[0]?.attached, false)
    assert.equal(dryRun.items[0]?.qualityValidation?.valid, true)
    assert.equal(dryRun.items[0]?.captionPrep?.subtitle_source, 'transcript')
    assert.equal(dryRun.items[0]?.captionPrep?.transcript_segment_range?.start_seconds, 1)
    assert.equal(dryRun.items[0]?.captionPrep?.transcript_segment_range?.end_seconds, 3)
    assert.equal(dryRun.items[0]?.subtitleBurn?.requested, true)
    assert.equal(dryRun.items[0]?.subtitleBurn?.burnedIn, true)
    assert.equal(dryRun.items[0]?.captionPrep?.suggested_subtitle_style.burned_in, false)
    assert.equal(dryRun.items[1]?.status, 'source_missing')
    assert.match(dryRun.items[1]?.error ?? '', /download-source/)
    assert.equal(dryRun.items[2]?.status, 'rendered')
    assert.equal(dryRun.items[2]?.captionPrep?.subtitle_source, 'metadata_only')
    assert.equal(dryRun.items[2]?.subtitleBurn?.requested, true)
    assert.equal(dryRun.items[2]?.subtitleBurn?.burnedIn, false)
    assert.match(dryRun.items[2]?.subtitleBurn?.skippedReason ?? '', /subtitle_source_metadata_only/)
    assert.ok(dryRun.items[2]?.packageId)
    assert.equal(dryRun.safety.downloadsVideo, false)
    assert.equal(dryRun.safety.uploadsVideo, false)
    assert.equal(dryRun.safety.postsVideo, false)
    assert.equal(dryRun.safety.clicksFinalPost, false)
    assert.equal(dryRun.safety.triggersTikTokDryRun, false)
    assert.equal(dryRun.readyForTikTokRetry.count, 0)
    assert.equal(fetchCalls, 0)

    const rbWomenOnly = await runBatchLocalClipGeneration(db as never, {
      limit: 3,
      assetRoot: root,
      attach: false,
      rerender: true,
      downloadSource: false,
      burnSubtitles: true,
      targetChannelId: 'a1000000-0000-0000-0000-000000000004',
      now: () => new Date('2026-07-14T12:32:00.000Z'),
    })
    assert.equal(rbWomenOnly.items.length, 1)
    assert.equal(rbWomenOnly.items[0]?.candidateId, 'candidate-rb-women-only')
    assert.equal(rbWomenOnly.items[0]?.status, 'rendered')
    assert.equal(rbWomenOnly.items[0]?.captionPrep?.subtitle_source, 'metadata_only')
    assert.equal(rbWomenOnly.items[0]?.subtitleBurn?.burnedIn, false)

    const attached = await runBatchLocalClipGeneration(db as never, {
      limit: 3,
      assetRoot: root,
      attach: true,
      rerender: true,
      downloadSource: false,
      burnSubtitles: true,
      now: () => new Date('2026-07-14T12:35:00.000Z'),
    })
    assert.ok(attached.items.some((item) => item.status === 'attached'))
    assert.ok(attached.readyForTikTokRetry.count >= 1)
    assert.ok(attached.readyForTikTokRetry.packages.every((pkg) => pkg.readiness.readyForTikTokRetry))
    assert.ok(attached.readyForTikTokRetry.packages.every((pkg) => pkg.captionPrep?.suggested_subtitle_style.burned_in === false))
    assert.equal(fetchCalls, 0)

    console.log(JSON.stringify({
      result: 'PASS',
      dryRun: {
        statuses: dryRun.items.map((item) => item.status),
        createdPackageId: dryRun.items.find((item) => item.candidateId === 'candidate-create')?.packageId ?? null,
        readyForTikTokRetryCount: dryRun.readyForTikTokRetry.count,
      },
      rbWomenOnly: {
        statuses: rbWomenOnly.items.map((item) => item.status),
        candidateIds: rbWomenOnly.items.map((item) => item.candidateId),
      },
      attached: {
        statuses: attached.items.map((item) => item.status),
        readyForTikTokRetryCount: attached.readyForTikTokRetry.count,
        readyPackages: attached.readyForTikTokRetry.packages.map((pkg) => ({
          packageId: pkg.packageId,
          candidateId: pkg.candidateId,
          assetPath: pkg.assetPath,
          label: pkg.readiness.label,
          captionPrep: pkg.captionPrep,
        })),
      },
      safety: {
        networkCalls: fetchCalls,
        downloadsVideo: attached.safety.downloadsVideo,
        uploadsVideo: attached.safety.uploadsVideo,
        postsVideo: attached.safety.postsVideo,
        clicksFinalPost: attached.safety.clicksFinalPost,
        triggersTikTokDryRun: attached.safety.triggersTikTokDryRun,
        livePublish: attached.safety.livePublish,
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
