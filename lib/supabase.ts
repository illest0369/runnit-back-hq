// LEGACY — not used in active ingest pipeline
import 'server-only'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const hasSupabaseEnv = Boolean(
  supabaseUrl && supabaseAnonKey && supabaseServiceKey,
)

function createMissingEnvClient(label: string) {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(`${label} Supabase env vars are required.`)
      },
    },
  )
}

// Public client — use for reads that don't need elevated access
export const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (createMissingEnvClient('Public') as ReturnType<typeof createClient>)

// Service client — bypasses RLS, use on server only
export const supabaseAdmin = hasSupabaseEnv
  ? createClient(supabaseUrl, supabaseServiceKey)
  : (createMissingEnvClient('Admin') as ReturnType<typeof createClient>)
