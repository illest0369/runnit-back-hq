import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'

import { createApp } from '../src/app.js'

async function withServer(app, run) {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')

  try {
    const address = server.address()
    assert(address && typeof address === 'object')
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

test('GET /health reports process liveness', async () => {
  await withServer(createApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`)

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      status: 'ok',
      service: 'rbhq-backend',
    })
  })
})

test('GET /ready succeeds only when Redis and Supabase probes pass', async () => {
  const app = createApp({
    checkRedis: async () => true,
    checkSupabase: async () => true,
  })

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ready`)

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      status: 'ready',
      dependencies: { redis: true, supabase: true },
    })
  })
})

test('GET /ready fails closed without exposing dependency errors', async () => {
  const app = createApp({
    checkRedis: async () => {
      throw new Error('redis://user:secret@example.invalid')
    },
    checkSupabase: async () => true,
  })

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ready`)
    const body = await response.json()

    assert.equal(response.status, 503)
    assert.deepEqual(body, {
      status: 'not_ready',
      dependencies: { redis: false, supabase: true },
    })
    assert.doesNotMatch(JSON.stringify(body), /secret/)
  })
})
