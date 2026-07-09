import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { refreshClipPrepForCandidate } from '../lib/clip-prep'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('--') ? value.trim() : null
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(supabaseUrl, serviceKey)
}

async function candidateIdFromPackage(packageId: string): Promise<string> {
  const { data, error } = await createSupabase()
    .from('mac_mini_clip_packages')
    .select('clip_candidate_id')
    .eq('id', packageId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Mac mini clip package not found.')
  }
  return (data as { clip_candidate_id: string }).clip_candidate_id
}

async function main() {
  const packageId = readArg('--package-id') ?? process.env.MAC_MINI_PACKAGE_ID?.trim() ?? null
  const candidateId = readArg('--candidate-id') ?? process.env.CLIP_CANDIDATE_ID?.trim() ?? (packageId ? await candidateIdFromPackage(packageId) : null)
  if (!candidateId) {
    throw new Error('Missing candidate id. Use --candidate-id <clip_candidate_id> or --package-id <mac_mini_clip_package_id>.')
  }

  const result = await refreshClipPrepForCandidate(createSupabase(), candidateId, { packageId })
  console.log(JSON.stringify({
    result: 'PASS',
    candidateId: result.candidateId,
    packageId: result.packageId,
    clipPrep: result.clipPrep,
    transcript: result.transcript,
    safety: {
      downloadsVideo: result.safety.downloadsVideo,
      rendersVideo: result.safety.rendersVideo,
      uploadsVideo: result.safety.uploadsVideo,
      postsVideo: result.safety.postsVideo,
      callsMetricool: false,
      callsN8n: false,
      clicksFinalPost: false,
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
