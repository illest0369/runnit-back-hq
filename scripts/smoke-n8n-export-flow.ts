const { randomUUID } = require('node:crypto') as typeof import('node:crypto')
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js')
const { config } = require('dotenv') as typeof import('dotenv')

const {
  GET: n8nConfigRoute,
} = require('../app/api/n8n-export/config/route') as typeof import('../app/api/n8n-export/config/route')
const {
  POST: n8nSendRoute,
} = require('../app/api/n8n-export/[clipId]/send/route') as typeof import('../app/api/n8n-export/[clipId]/send/route')
const {
  getClipById,
} = require('../lib/moderation-queue') as typeof import('../lib/moderation-queue')
const {
  SESSION_COOKIE,
} = require('../lib/auth') as typeof import('../lib/auth')
const {
  CSRF_COOKIE,
  CSRF_HEADER,
} = require('../lib/csrf') as typeof import('../lib/csrf')
const {
  getSessionSecret,
} = require('../lib/security') as typeof import('../lib/security')
const {
  signSessionPayload,
} = require('../lib/session') as typeof import('../lib/session')

config({ path: '.env.local', quiet: true })
config({ quiet: true })

const SPORTS_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000001'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (typeof value === 'undefined') {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

async function createRouteHeaders(role: 'admin' | 'user') {
  const csrfToken = `smoke-n8n-csrf-${role}`
  const sessionValue = await signSessionPayload(
    JSON.stringify({
      userId: `smoke-n8n-${role}`,
      username: `smoke_${role}`,
      role,
      channelIds: [SPORTS_CHANNEL_ID],
    }),
    getSessionSecret(),
  )

  return {
    cookie: `${SESSION_COOKIE}=${encodeURIComponent(sessionValue)}; ${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`,
    [CSRF_HEADER]: csrfToken,
    'content-type': 'application/json',
  }
}

async function callConfigRoute(role: 'admin' | 'user') {
  const response = await n8nConfigRoute(
    new Request('http://smoke.local/api/n8n-export/config', {
      method: 'GET',
      headers: await createRouteHeaders(role),
    }),
  )
  const body = await response.json()
  return { status: response.status, body }
}

async function callSendRoute(clipId: string) {
  const response = await n8nSendRoute(
    new Request(`http://smoke.local/api/n8n-export/${clipId}/send`, {
      method: 'POST',
      headers: await createRouteHeaders('admin'),
      body: JSON.stringify({ action: 'publish_now' }),
    }),
    { params: Promise.resolve({ clipId }) },
  )
  const body = await response.json()
  return { status: response.status, body }
}

async function insertSmokeClip(supabase: ReturnType<typeof createSupabase>, clipId: string) {
  const now = new Date().toISOString()
  const { error } = await supabase.from('clips').insert({
    id: clipId,
    channel_id: SPORTS_CHANNEL_ID,
    external_id: `smoke-n8n-${clipId}`,
    title: 'Smoke n8n export clip',
    hook: 'Smoke n8n export hook',
    source_name: 'Codex Smoke',
    source_type: 'test',
    thumbnail_url: 'https://images.example.com/smoke-n8n.jpg',
    video_url: 'https://cdn.example.com/smoke-n8n.mp4',
    source_url: `https://example.com/smoke-n8n-${clipId}`,
    original_platform: 'test',
    duration_seconds: 24,
    ai_score: 90,
    virality_score: 86,
    hook_strength: 82,
    moderation_notes: [],
    risk_flags: [],
    status: 'approved',
    publish_status: 'ready_for_manual_publish',
    approved_at: now,
    created_at: now,
    updated_at: now,
  })

  if (error) {
    throw new Error(error.message)
  }
}

async function cleanupN8nHandoffs(supabase: ReturnType<typeof createSupabase>, clipId: string) {
  const { error } = await supabase.from('n8n_handoffs').delete().eq('clip_id', clipId)
  if (error && !error.message.toLowerCase().includes('n8n_handoffs')) {
    throw new Error(error.message)
  }
}

async function main() {
  const originalEnv = {
    provider: process.env.PUBLISH_PROVIDER,
    webhookUrl: process.env.N8N_WEBHOOK_URL,
    webhookSecret: process.env.N8N_WEBHOOK_SECRET,
    testMode: process.env.N8N_TEST_MODE,
    timeoutMs: process.env.N8N_TIMEOUT_MS,
  }
  const supabase = createSupabase()
  const clipId = randomUUID()

  try {
    await insertSmokeClip(supabase, clipId)

    delete process.env.PUBLISH_PROVIDER
    delete process.env.N8N_WEBHOOK_URL
    delete process.env.N8N_WEBHOOK_SECRET
    delete process.env.N8N_TEST_MODE
    delete process.env.N8N_TIMEOUT_MS

    const nonAdminConfig = await callConfigRoute('user')
    assert(nonAdminConfig.status === 403, `Non-admin config returned ${nonAdminConfig.status}, expected 403.`)

    const adminConfig = await callConfigRoute('admin')
    assert(adminConfig.status === 200 && adminConfig.body?.ok, 'Admin config route failed.')
    assert(adminConfig.body.data.provider === 'manual', 'Default provider should be manual.')
    assert(adminConfig.body.data.webhookUrlPresent === false, 'Missing n8n webhook URL was not reported.')
    assert(adminConfig.body.data.secretPresent === false, 'Missing n8n secret was not reported.')

    const notConfiguredSend = await callSendRoute(clipId)
    assert(notConfiguredSend.status === 200 && notConfiguredSend.body?.ok, 'Missing n8n env should not crash send route.')
    assert(notConfiguredSend.body.data.n8nStatus === 'n8n_not_configured', 'Missing n8n env did not return n8n_not_configured.')

    process.env.PUBLISH_PROVIDER = 'n8n'
    process.env.N8N_TEST_MODE = 'true'
    delete process.env.N8N_WEBHOOK_URL

    const testModeSend = await callSendRoute(clipId)
    assert(testModeSend.status === 200 && testModeSend.body?.ok, 'n8n test mode send route failed.')
    assert(testModeSend.body.data.n8nStatus === 'n8n_test_mode', 'n8n test mode did not return n8n_test_mode.')

    const finalClip = await getClipById(clipId, { channelIds: [SPORTS_CHANNEL_ID] })
    assert(finalClip?.publish_status === 'ready_for_manual_publish', 'n8n test mode changed publish status as if live.')

    console.log(JSON.stringify(
      {
        result: 'PASS',
        config: {
          admin: adminConfig.body.data,
          nonAdminStatus: nonAdminConfig.status,
        },
        send: {
          missingEnv: notConfiguredSend.body.data.n8nStatus,
          testMode: testModeSend.body.data.n8nStatus,
          finalPublishStatus: finalClip.publish_status,
        },
      },
      null,
      2,
    ))
  } catch (error) {
    console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
    process.exitCode = 1
  } finally {
    restoreEnv('PUBLISH_PROVIDER', originalEnv.provider)
    restoreEnv('N8N_WEBHOOK_URL', originalEnv.webhookUrl)
    restoreEnv('N8N_WEBHOOK_SECRET', originalEnv.webhookSecret)
    restoreEnv('N8N_TEST_MODE', originalEnv.testMode)
    restoreEnv('N8N_TIMEOUT_MS', originalEnv.timeoutMs)
    await cleanupN8nHandoffs(supabase, clipId).catch(() => undefined)
    await supabase.from('clips').delete().eq('id', clipId)
  }
}

void main()

export {}
