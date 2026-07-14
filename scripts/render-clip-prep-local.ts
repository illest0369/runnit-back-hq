import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { renderLocalClipPrepForCandidateOrPackage } from '../lib/local-render-prep'

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
  const outputDir = readArg('--output-dir') ?? null
  const attach = hasFlag('--attach')

  if (!sourcePath && !sourceUrl && !packageId) {
    throw new Error('Missing source input. Use --source-path <local_source.mp4>, --source-url <url>, or --package-id <id> with package source metadata.')
  }

  const result = await renderLocalClipPrepForCandidateOrPackage(createSupabase(), {
    packageId,
    candidateId,
    sourcePath,
    sourceUrl,
    assetRoot,
    outputDir,
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
      startSeconds: result.startSeconds,
      endSeconds: result.endSeconds,
      durationSeconds: result.durationSeconds,
      sizeBytes: result.sizeBytes,
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
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
