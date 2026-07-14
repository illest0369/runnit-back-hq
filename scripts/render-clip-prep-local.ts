import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import {
  renderLocalClipPrepForCandidateOrPackage,
  renderLocalClipPrepVerticalAsset,
} from '../lib/local-render-prep'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('--') ? value.trim() : null
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(supabaseUrl, serviceKey)
}

async function main() {
  const packageId = readArg('--package-id') ?? process.env.MAC_MINI_PACKAGE_ID?.trim() ?? null
  const candidateId = readArg('--candidate-id') ?? process.env.CLIP_CANDIDATE_ID?.trim() ?? null
  const sourcePath = readArg('--source-path') ?? process.env.CLIP_PREP_SOURCE_PATH?.trim() ?? null
  const sourceUrl = readArg('--source-url') ?? process.env.CLIP_PREP_SOURCE_URL?.trim() ?? null
  const assetRoot = readArg('--asset-root') ?? process.env.MAC_MINI_ASSET_ROOT?.trim() ?? null
  const sourceDir = readArg('--source-dir') ?? process.env.CLIP_PREP_LOCAL_SOURCE_DIR?.trim() ?? null
  const outputDir = readArg('--output-dir') ?? null
  const openingText = readArg('--opening-text') ?? null
  const downloadSource = hasFlag('--download-source')
  const attach = hasFlag('--attach')
  const verticalAsset = hasFlag('--vertical-asset')

  if (verticalAsset) {
    if (!sourcePath) {
      throw new Error('Missing source input. Use --vertical-asset --source-path <local_clip.mp4>.')
    }
    if (attach) {
      throw new Error('--vertical-asset refuses --attach. Verify the vertical variant before replacing package assets.')
    }

    const result = await renderLocalClipPrepVerticalAsset({
      sourcePath,
      packageId,
      assetRoot,
      outputDir,
      openingText,
    })

    console.log(JSON.stringify({
      result: 'PASS',
      render: {
        status: result.status,
        layout: result.layout,
        durationMode: result.durationMode,
        packageId: result.packageId,
        sourcePath: result.sourcePath,
        outputPath: result.outputPath,
        assetRoot: result.assetRoot,
        durationSeconds: result.durationSeconds,
        sizeBytes: result.sizeBytes,
        renderPlan: result.renderPlan,
        qualityValidation: result.qualityValidation,
        attached: false,
      },
      safety: {
        downloadsVideo: result.safety.downloadsVideo,
        uploadsVideo: result.safety.uploadsVideo,
        postsVideo: result.safety.postsVideo,
        clicksFinalPost: result.safety.clicksFinalPost,
        livePublish: result.safety.livePublish,
        callsMetricool: false,
        callsN8n: false,
      },
    }, null, 2))
    return
  }

  if (!sourcePath && !sourceUrl && !packageId && !candidateId) {
    throw new Error('Missing source input. Use --source-path <local_source.mp4>, --source-url <url>, --package-id <id>, or --candidate-id <id> with package source metadata.')
  }

  const result = await renderLocalClipPrepForCandidateOrPackage(createSupabase(), {
    packageId,
    candidateId,
    sourcePath,
    sourceUrl,
    assetRoot,
    sourceDir,
    outputDir,
    downloadSource,
    attach,
  })

  console.log(JSON.stringify({
    result: 'PASS',
    render: {
      status: result.status,
      packageId: result.packageId,
      candidateId: result.candidateId,
      sourcePath: result.sourcePath,
      sourceDownloaded: result.sourceDownloaded,
      outputPath: result.outputPath,
      assetRoot: result.assetRoot,
      sourceDir: result.sourceDir,
      startSeconds: result.startSeconds,
      endSeconds: result.endSeconds,
      durationSeconds: result.durationSeconds,
      sizeBytes: result.sizeBytes,
      qualityValidation: result.qualityValidation,
      attached: result.attached,
      attachedPackageId: result.attachedPackage?.id ?? null,
      attachedAssetStatus: result.attachedPackage?.assetStatus ?? null,
    },
    safety: {
      downloadsVideo: result.safety.downloadsVideo,
      uploadsVideo: result.safety.uploadsVideo,
      postsVideo: result.safety.postsVideo,
      clicksFinalPost: result.safety.clicksFinalPost,
      livePublish: result.safety.livePublish,
      callsMetricool: false,
      callsN8n: false,
    },
  }, null, 2))
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  const status = message.startsWith('source_missing:')
    ? 'source_missing'
    : message.startsWith('download_failed:')
      ? 'download_failed'
      : null
  console.error(JSON.stringify({ result: 'FAIL', status, error: message }, null, 2))
  process.exitCode = 1
})
