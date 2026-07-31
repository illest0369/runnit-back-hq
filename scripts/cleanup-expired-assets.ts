import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { cleanupExpiredAssets } from '../lib/asset-retention'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('--') ? value.trim() : null
}

function readLimit(): number {
  const parsed = Number(readArg('--limit') ?? '')
  if (!Number.isFinite(parsed) || parsed <= 0) return 100
  return Math.min(500, Math.trunc(parsed))
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
  const result = await cleanupExpiredAssets(createSupabase(), {
    limit: readLimit(),
  })

  console.log(JSON.stringify({
    result: result.failed > 0 ? 'WARN' : 'PASS',
    cleanup: {
      scanned: result.scanned,
      deleted: result.deleted,
      skipped: result.skipped,
      failed: result.failed,
      results: result.results.map((item) => ({
        clipId: item.clipId,
        storageProvider: item.storageProvider,
        hasStorageKey: Boolean(item.storageKey),
        status: item.status,
        error: item.error,
      })),
    },
    safety: {
      deletesDurableStorageOnly: true,
      posts: false,
      schedules: false,
      callsMetricool: false,
      uploadsToTikTok: false,
      uploadsToInstagram: false,
      uploadsToYouTube: false,
      secretsPrinted: false,
    },
  }, null, 2))

  if (result.failed > 0) {
    process.exitCode = 1
  }
}

void main().catch((error) => {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
