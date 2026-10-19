import cors from 'cors'
import express from 'express'

import { checkRedis as defaultCheckRedis, checkSupabase as defaultCheckSupabase } from './dependencies.js'

async function probe(check) {
  try {
    return (await check()) === true
  } catch {
    return false
  }
}

export function createApp({
  checkRedis = defaultCheckRedis,
  checkSupabase = defaultCheckSupabase,
} = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok', service: 'rbhq-backend' })
  })

  app.get('/ready', async (_request, response) => {
    const [redis, supabase] = await Promise.all([
      probe(checkRedis),
      probe(checkSupabase),
    ])
    const ready = redis && supabase

    response.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      dependencies: { redis, supabase },
    })
  })

  return app
}
