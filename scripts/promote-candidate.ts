import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { promoteClipCandidateToReview } from '../lib/candidate-promotion'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value?.trim() || null
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
  const candidateId = readArg('--candidate-id') ?? process.env.CLIP_CANDIDATE_ID?.trim()
  if (!candidateId) {
    throw new Error('Missing candidate id. Use --candidate-id <clip_candidate_id>.')
  }

  const result = await promoteClipCandidateToReview(createSupabase(), candidateId)
  console.log(JSON.stringify({ result: 'PASS', promotion: result }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
