// LEGACY — not used in active ingest pipeline
import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const hasSupabaseAdminEnv = true

function createRequiredClient(): ReturnType<typeof createClient<any>> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseServiceKey

  if (!url || !serviceKey) {
    throw new Error('Supabase admin env vars are required for worker runtime.')
  }

  return createClient(url, serviceKey)
}

let supabaseAdminClientInstance: ReturnType<typeof createClient<any>> | null = null

export const supabaseAdminClient = new Proxy({} as ReturnType<typeof createClient<any>>, {
  get(_target, property, receiver) {
    supabaseAdminClientInstance ??= createRequiredClient()
    return Reflect.get(supabaseAdminClientInstance, property, receiver)
  },
}) as ReturnType<typeof createClient<any>>
