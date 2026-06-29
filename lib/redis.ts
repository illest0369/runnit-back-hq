import IORedis from 'ioredis'

let sharedRedisConnection: IORedis | undefined

function getRequiredRedisUrl() {
  console.log('[redis] connected:', Boolean(process.env.REDIS_URL))
  const redisUrl = process.env.REDIS_URL?.trim()

  if (!redisUrl) {
    throw new Error('Missing REDIS_URL')
  }

  return redisUrl
}

export function createRedisConnection() {
  const connection = new IORedis(getRequiredRedisUrl(), {
    family: 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  connection.on('connect', () => {
    console.log('[redis] connect event received')
  })

  connection.on('error', (error) => {
    console.error('[redis] connection error', error.message)
  })

  return connection
}

export function getSharedRedisConnection() {
  if (!sharedRedisConnection) {
    sharedRedisConnection = createRedisConnection()
  }

  return sharedRedisConnection
}
