import { createClient } from '@supabase/supabase-js'
import Redis from 'ioredis'

export async function checkRedis() {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) return false

  const redis = new Redis(redisUrl, {
    connectTimeout: 3_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  })

  try {
    await redis.connect()
    return (await redis.ping()) === 'PONG'
  } catch {
    return false
  } finally {
    redis.disconnect()
  }
}

export async function checkSupabase() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) return false

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await supabase.from('channels').select('id').limit(1)
  return error === null
}
