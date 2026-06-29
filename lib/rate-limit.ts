import { getSharedRedisConnection } from './redis'

type RateLimitInput = {
  scope: string
  key: string
  limit: number
  windowSeconds: number
}

export async function consumeRateLimit(input: RateLimitInput) {
  const redis = getSharedRedisConnection()
  const redisKey = `rate-limit:${input.scope}:${input.key}`

  const current = await redis.incr(redisKey)

  if (current === 1) {
    await redis.expire(redisKey, input.windowSeconds)
  }

  const ttl = await redis.ttl(redisKey)

  return {
    allowed: current <= input.limit,
    count: current,
    remaining: Math.max(input.limit - current, 0),
    resetSeconds: Math.max(ttl, 0),
  }
}

export function getClientIP(req: Request) {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()

  return req.headers.get('x-real-ip') || 'unknown'
}

export async function consumeAuthRateLimit(request: Request, scope = 'auth') {
  return consumeRateLimit({
    scope,
    key: getClientIP(request),
    limit: 5,
    windowSeconds: 60,
  })
}
