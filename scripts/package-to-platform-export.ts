import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { createPlatformReadyPackageFromMacMini } from '../lib/platform-package-bridge'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1]?.trim() || null
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
  const packageId = argValue('--package-id')
  if (!packageId) {
    throw new Error('Usage: npm run package:platform-export -- --package-id <mac_mini_clip_packages.id>')
  }

  const result = await createPlatformReadyPackageFromMacMini(createSupabase(), packageId)
  console.log(JSON.stringify({
    ok: true,
    packageId: result.packageId,
    clipId: result.clipId,
    publishStatus: result.publishStatus,
    publicUrl: result.publicUrl,
    storageMode: result.storageMode,
    storageReference: result.storageReference,
    targetPlatforms: result.platformPackage.targetPlatforms,
    safety: result.safety,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
