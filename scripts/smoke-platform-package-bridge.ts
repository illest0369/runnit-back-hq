import { execFile } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { createPlatformReadyPackageFromMacMini } from '../lib/platform-package-bridge'
import { buildPublishExportPackage } from '../lib/export/build-export'

const execFileAsync = promisify(execFile)

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

type TableName = 'mac_mini_clip_packages' | 'clip_candidates' | 'clips'

type MemoryTables = Record<TableName, Array<Record<string, unknown>>>

class MemoryQuery {
  private filters: Array<{ key: string; value: unknown }> = []
  private updatePayload: Record<string, unknown> | null = null
  private insertPayload: Record<string, unknown> | null = null

  constructor(private tables: MemoryTables, private table: TableName) {}

  select() {
    return this
  }

  eq(key: string, value: unknown) {
    this.filters.push({ key, value })
    return this
  }

  update(payload: Record<string, unknown>) {
    this.updatePayload = payload
    return this
  }

  insert(payload: Record<string, unknown>) {
    this.insertPayload = payload
    return this
  }

  maybeSingle() {
    const row = this.findRows()[0] ?? null
    return Promise.resolve({ data: row, error: null })
  }

  single() {
    if (this.insertPayload) {
      const inserted = {
        id: this.insertPayload.id ?? `clip-${this.tables[this.table].length + 1}`,
        ...this.insertPayload,
      }
      this.tables[this.table].push(inserted)
      return Promise.resolve({ data: inserted, error: null })
    }

    const row = this.findRows()[0] ?? null
    if (!row) {
      return Promise.resolve({ data: null, error: { message: `${this.table} row not found` } })
    }

    if (this.updatePayload) {
      Object.assign(row, this.updatePayload)
    }
    return Promise.resolve({ data: row, error: null })
  }

  private findRows() {
    return this.tables[this.table].filter((row) =>
      this.filters.every((filter) => row[filter.key] === filter.value),
    )
  }
}

function createMemorySupabase(tables: MemoryTables) {
  return {
    from(table: TableName) {
      return new MemoryQuery(tables, table)
    },
  }
}

async function createFixtureMp4(filePath: string) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=1080x1920:rate=24',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t',
    '1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    filePath,
  ], { maxBuffer: 1024 * 1024 })
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'rbhq-platform-bridge-'))
  const localAssetPath = path.join(tempDir, 'women-package.mp4')
  const copiedPaths: string[] = []

  try {
    await createFixtureMp4(localAssetPath)

    const now = '2026-07-23T12:00:00.000Z'
    const tables: MemoryTables = {
      mac_mini_clip_packages: [{
        id: 'pkg-women-1',
        clip_candidate_id: 'candidate-women-1',
        ingested_video_id: 'video-women-1',
        target_channel_id: 'a3000000-0000-0000-0000-000000000003',
        lane_label: 'RB Women',
        lane_slug: 'women',
        browser_channel_key: 'rb_women',
        source_url: 'https://youtube.example/watch?v=women-1',
        source_title: 'RB Women source title',
        source_name: 'RB Women Source',
        caption: 'Big RB Women moment #RBWomen',
        hashtags: ['#RBWomen', '#Basketball'],
        why_now: 'Strong source candidate is ready.',
        hook: 'She took over late',
        operator_summary: 'Use the closing push.',
        edit_notes: ['candidate_start_seconds:12', 'candidate_end_seconds:24'],
        score: 88,
        package_payload: {
          version: 'rbhq-mac-mini-clip-package-v1',
          targetPlatform: 'tiktok',
          publishAction: 'dry_run',
          testMode: true,
          tiktokDraft: {
            title: 'She took over late',
          },
          safety: {
            livePostingAllowed: false,
            metricoolAllowed: false,
            schedulerDependencyAllowed: false,
            operatorCredentialsRequired: false,
            finalPostClickAllowed: false,
          },
        },
        package_status: 'ready',
        handoff_status: 'pending',
        worker_id: null,
        fetched_at: null,
        dry_run_at: null,
        dry_run_result: null,
        dry_run_error: null,
        local_asset_path: localAssetPath,
        asset_status: 'attached',
        asset_error: null,
        asset_attached_at: now,
        tiktok_staging_status: 'not_requested',
        tiktok_staging_requested_at: null,
        tiktok_staging_requested_by: null,
        tiktok_staging_at: null,
        tiktok_staging_error: null,
        created_at: now,
        updated_at: now,
      }],
      clip_candidates: [{
        id: 'candidate-women-1',
        ingested_video_id: 'video-women-1',
        target_channel_id: 'a3000000-0000-0000-0000-000000000003',
        start_seconds: 12,
        end_seconds: 24,
        suggested_clip_start_seconds: 12,
        suggested_clip_end_seconds: 24,
        title: 'She took over late',
        summary: 'A concise platform-ready description.',
        hook_text: 'She took over late',
        caption: 'Big RB Women moment #RBWomen',
        hashtags: ['#RBWomen', '#Basketball'],
        score: 88,
        score_breakdown: {},
        status: 'approved_for_handoff',
        ingested_videos: {
          id: 'video-women-1',
          source_channel_id: 'source-women-1',
          external_video_id: 'yt-women-1',
          platform: 'youtube',
          title: 'RB Women source title',
          description: 'Source description.',
          video_url: 'https://youtube.example/watch?v=women-1',
          thumbnail_url: 'https://example.com/thumb.jpg',
          duration_seconds: 300,
          source_channels: {
            id: 'source-women-1',
            channel_key: 'rb-women-source',
            display_name: 'RB Women Source',
            target_rbhq_channel_id: 'a3000000-0000-0000-0000-000000000003',
          },
        },
      }],
      clips: [],
    }

    const memorySupabase = createMemorySupabase(tables) as unknown as Parameters<typeof createPlatformReadyPackageFromMacMini>[0]
    const result = await createPlatformReadyPackageFromMacMini(memorySupabase, 'pkg-women-1', {
      now: () => new Date(now),
    })

    copiedPaths.push(path.join(process.cwd(), 'public', 'generated-clips', result.storageReference))
    assert(result.publishStatus === 'ready_for_manual_publish', 'Package did not become manual-publish ready.')
    assert(result.storageMode === 'local_dev', 'Smoke should use local-dev storage without R2 credentials.')
    assert(result.publicUrl.endsWith('.mp4'), 'Platform asset URL should be an MP4 URL.')
    assert(result.platformPackage.asset.localAssetPath === localAssetPath, 'Original local asset path was not preserved.')
    assert(result.platformPackage.targetPlatforms.includes('tiktok'), 'TikTok export copy missing.')
    assert(result.platformPackage.targetPlatforms.includes('instagram_reels'), 'Instagram Reels export copy missing.')
    assert(result.platformPackage.targetPlatforms.includes('youtube_shorts'), 'YouTube Shorts export copy missing.')
    assert(result.safety.callsMetricool === false, 'Bridge must not call Metricool.')
    assert(result.safety.uploadsToTikTok === false, 'Bridge must not upload to TikTok.')
    assert((await stat(localAssetPath)).isFile(), 'Original attached local asset was removed.')
    assert((await stat(copiedPaths[0])).isFile(), 'Copied platform MP4 was not created.')

    const clip = tables.clips[0]
    assert(clip.status === 'approved', 'Clip was not approved for export.')
    assert(clip.publish_status === 'ready_for_manual_publish', 'Clip was not marked ready for manual publish.')
    assert(clip.video_url === result.publicUrl, 'Clip video_url does not use platform asset URL.')
    assert(Array.isArray(clip.risk_flags) && clip.risk_flags.includes('platform_ready'), 'Clip does not expose platform_ready flag.')

    const exportPackage = buildPublishExportPackage({
      id: String(clip.id),
      channel_id: String(clip.channel_id),
      title: String(clip.title),
      hook: String(clip.hook),
      recommended_hook: String(clip.recommended_hook),
      source_name: String(clip.source_name),
      sport: null,
      league: null,
      video_url: String(clip.video_url),
      source_url: String(clip.source_url),
      thumbnail_url: String(clip.thumbnail_url),
      moderation_notes: clip.moderation_notes as string[],
      approved_at: String(clip.approved_at),
      updated_at: String(clip.updated_at),
      status: String(clip.status),
      publish_status: String(clip.publish_status),
    })
    assert(exportPackage.rendered_mp4_url === result.publicUrl, 'Export package missing rendered MP4 URL.')
    assert(exportPackage.source_url === 'https://youtube.example/watch?v=women-1', 'Export package lost source URL.')
    assert(exportPackage.selected_clip?.start_seconds === 12, 'Export package lost selected start time.')
    assert(exportPackage.selected_clip?.end_seconds === 24, 'Export package lost selected end time.')
    assert(exportPackage.platform_copy?.tiktok.video_url === result.publicUrl, 'Export package lost TikTok-safe video URL.')

    console.log(JSON.stringify({
      ok: true,
      clipId: result.clipId,
      packageId: result.packageId,
      publishStatus: result.publishStatus,
      storageMode: result.storageMode,
      publicUrl: result.publicUrl,
      safety: result.safety,
    }, null, 2))
  } finally {
    await Promise.allSettled(copiedPaths.map((filePath) => rm(filePath, { force: true })))
    await rm(tempDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
