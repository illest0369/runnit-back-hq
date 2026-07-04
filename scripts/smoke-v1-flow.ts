const { randomUUID } = require('node:crypto') as typeof import('node:crypto')
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js')
const { config } = require('dotenv') as typeof import('dotenv')
const bcrypt = require('bcryptjs') as typeof import('bcryptjs')

const {
  POST: publishNowRoute,
} = require('../app/api/metricool-export/[clipId]/publish-now/route') as typeof import('../app/api/metricool-export/[clipId]/publish-now/route')
const {
  POST: scheduleRoute,
} = require('../app/api/metricool-export/[clipId]/schedule/route') as typeof import('../app/api/metricool-export/[clipId]/schedule/route')
const {
  authenticateAppUserByEmailPassword,
  authenticateAppUserByPin,
} = require('../lib/app-users') as typeof import('../lib/app-users')
const {
  readSessionCookie,
  SESSION_COOKIE,
} = require('../lib/auth') as typeof import('../lib/auth')
const {
  CSRF_COOKIE,
  CSRF_HEADER,
} = require('../lib/csrf') as typeof import('../lib/csrf')
const {
  approveClip,
  getClipById,
  getClips,
  getReadyPublishClips,
  holdClip,
  rejectClip,
} = require('../lib/moderation-queue') as typeof import('../lib/moderation-queue')
const {
  validateMetricoolConfigForChannel,
  validateMetricoolLiveConfigForChannel,
} = require('../lib/metricool') as typeof import('../lib/metricool')
const {
  getSessionSecret,
} = require('../lib/security') as typeof import('../lib/security')
const {
  signSessionPayload,
} = require('../lib/session') as typeof import('../lib/session')
const {
  closeSharedRedisConnection,
} = require('../lib/redis') as typeof import('../lib/redis')

config({ path: '.env.local', quiet: true })
config({ quiet: true })

const SPORTS_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000001'
const ARENA_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000002'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function effectiveMetricoolStatus(clip: { publish_status: string; moderation_notes?: string[] | null }) {
  return clip.moderation_notes
    ?.find((note) => note.startsWith('metricool_status:'))
    ?.slice('metricool_status:'.length) ?? clip.publish_status
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

function isMetricoolHandoffSchemaError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return (
    message.includes('metricool_handoffs') ||
    (message.includes('publish_status') && message.includes('does not exist'))
  )
}

async function readLatestMetricoolHandoffStatus(
  supabase: ReturnType<typeof createSupabase>,
  clipId: string,
): Promise<{ available: boolean; publishStatus: string | null }> {
  const { data, error } = await supabase
    .from('metricool_handoffs')
    .select('publish_status, created_at')
    .eq('clip_id', clipId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMetricoolHandoffSchemaError(error)) {
      return { available: false, publishStatus: null }
    }
    throw new Error(error.message)
  }

  return {
    available: true,
    publishStatus: typeof data?.publish_status === 'string' ? data.publish_status : null,
  }
}

async function createRouteHeaders(): Promise<Record<string, string>> {
  const sessionValue = await signSessionPayload(
    JSON.stringify({
      userId: 'smoke-user-camel',
      username: 'rb_sports',
      role: 'operator',
      channelIds: [SPORTS_CHANNEL_ID],
    }),
    getSessionSecret(),
  )
  const csrfToken = 'smoke-v1-csrf-token'
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(sessionValue)}; ${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`

  assert(await readSessionCookie(sessionValue), 'Smoke route session could not be signed.')

  return {
    cookie,
    [CSRF_HEADER]: csrfToken,
    'content-type': 'application/json',
  }
}

async function callPublishNowRoute(clipId: string) {
  const response = await publishNowRoute(
    new Request(`http://smoke.local/api/metricool-export/${clipId}/publish-now`, {
      method: 'POST',
      headers: await createRouteHeaders(),
    }),
    { params: Promise.resolve({ clipId }) },
  )
  const body = await response.json()
  return { status: response.status, body }
}

async function callScheduleRoute(clipId: string, scheduledAt: string) {
  const response = await scheduleRoute(
    new Request(`http://smoke.local/api/metricool-export/${clipId}/schedule`, {
      method: 'POST',
      headers: await createRouteHeaders(),
      body: JSON.stringify({ scheduledAt }),
    }),
    { params: Promise.resolve({ clipId }) },
  )
  const body = await response.json()
  return { status: response.status, body }
}

async function insertSmokeClip(
  supabase: ReturnType<typeof createSupabase>,
  input: { id: string; channelId: string; label: string; status?: 'pending' | 'approved'; publishStatus?: string },
) {
  const now = new Date().toISOString()
  const { error } = await supabase.from('clips').insert({
    id: input.id,
    channel_id: input.channelId,
    external_id: `smoke-v1-${input.label}-${input.id}`,
    title: `Smoke V1 ${input.label}`,
    hook: `Smoke V1 hook ${input.label}`,
    source_name: 'Codex Smoke',
    source_type: 'test',
    thumbnail_url: 'https://images.example.com/smoke-v1.jpg',
    video_url: `https://cdn.example.com/smoke-v1-${input.label}.mp4`,
    source_url: `https://example.com/smoke-v1-${input.label}`,
    original_platform: 'test',
    duration_seconds: 22,
    ai_score: 91,
    virality_score: 88,
    hook_strength: 84,
    moderation_notes: [],
    risk_flags: [],
    status: input.status ?? 'pending',
    publish_status: input.publishStatus ?? 'not_ready',
    approved_at: input.status === 'approved' ? now : null,
    created_at: now,
    updated_at: now,
  })

  if (error) {
    throw new Error(error.message)
  }
}

async function main() {
  const originalAppUsers = process.env.APP_USERS_JSON
  const originalMetricool = {
    testMode: process.env.METRICOOL_TEST_MODE,
    sports: process.env.METRICOOL_BRAND_RB_SPORTS,
    arena: process.env.METRICOOL_BRAND_RB_ARENA,
    apiUrl: process.env.METRICOOL_API_URL,
    apiKey: process.env.METRICOOL_API_KEY,
    userId: process.env.METRICOOL_USER_ID,
  }

  const supabase = createSupabase()
  const ids = {
    approve: randomUUID(),
    reject: randomUUID(),
    hold: randomUUID(),
    publish: randomUUID(),
    schedule: randomUUID(),
    unauthorized: randomUUID(),
  }

  try {
    process.env.APP_USERS_JSON = JSON.stringify([
      {
        userId: 'smoke-user-camel',
        username: 'rb_sports',
        email: 'camel@example.test',
        role: 'operator',
        channelIds: [SPORTS_CHANNEL_ID],
        passwordHash: bcrypt.hashSync('CamelPass123!', 8),
        pinHash: bcrypt.hashSync('123456', 8),
      },
      {
        userId: 'smoke-user-snake',
        username: 'rb_arena',
        email: 'snake@example.test',
        role: 'operator',
        channelIds: [ARENA_CHANNEL_ID],
        password_hash: bcrypt.hashSync('SnakePass123!', 8),
        pin_hash: bcrypt.hashSync('654321', 8),
      },
    ])

    const passwordHashUser = await authenticateAppUserByEmailPassword('camel@example.test', 'CamelPass123!')
    const passwordSnakeUser = await authenticateAppUserByEmailPassword('snake@example.test', 'SnakePass123!')
    const pinUser = await authenticateAppUserByPin('654321')
    assert(passwordHashUser?.username === 'rb_sports', 'passwordHash email/password login failed.')
    assert(passwordSnakeUser?.username === 'rb_arena', 'password_hash email/password login failed.')
    assert(pinUser?.username === 'rb_arena', 'transitional PIN login failed.')

    await insertSmokeClip(supabase, { id: ids.approve, channelId: SPORTS_CHANNEL_ID, label: 'approve' })
    await insertSmokeClip(supabase, { id: ids.reject, channelId: SPORTS_CHANNEL_ID, label: 'reject' })
    await insertSmokeClip(supabase, { id: ids.hold, channelId: SPORTS_CHANNEL_ID, label: 'hold' })
    await insertSmokeClip(supabase, {
      id: ids.publish,
      channelId: SPORTS_CHANNEL_ID,
      label: 'publish',
      status: 'approved',
      publishStatus: 'ready_for_manual_publish',
    })
    await insertSmokeClip(supabase, {
      id: ids.schedule,
      channelId: SPORTS_CHANNEL_ID,
      label: 'schedule',
      status: 'approved',
      publishStatus: 'ready_for_manual_publish',
    })
    await insertSmokeClip(supabase, {
      id: ids.unauthorized,
      channelId: ARENA_CHANNEL_ID,
      label: 'unauthorized',
      status: 'approved',
      publishStatus: 'ready_for_manual_publish',
    })

    const queue = await getClips({ channelIds: [SPORTS_CHANNEL_ID], limit: 20 })
    assert(queue.some((clip) => clip.id === ids.approve), 'Review queue did not load smoke clip.')
    assert(queue.some((clip) => clip.id === ids.approve && clip.ai_score > 0), 'Ranking score missing from queue.')

    const approved = await approveClip(ids.approve, { channelIds: [SPORTS_CHANNEL_ID], approvedBy: 'smoke-user-camel' })
    const rejected = await rejectClip(ids.reject, { channelIds: [SPORTS_CHANNEL_ID] })
    const held = await holdClip(ids.hold, { channelIds: [SPORTS_CHANNEL_ID] })
    assert(approved?.status === 'approved', 'Approve did not persist.')
    assert(rejected?.status === 'rejected', 'Reject did not persist.')
    assert(held?.status === 'skipped', 'Hold did not persist.')
    assert(held.publish_status === 'not_ready', 'Held content became export-ready.')

    const heldQueue = await getClips({ channelIds: [SPORTS_CHANNEL_ID], status: 'skipped', limit: 20 })
    assert(heldQueue.some((clip) => clip.id === ids.hold), 'Held content is not recoverable/reviewable.')

    const ready = await getReadyPublishClips({ channelIds: [SPORTS_CHANNEL_ID], limit: 50 })
    assert(!ready.some((clip) => clip.id === ids.hold), 'Held content appeared in export-ready queue.')

    const unauthorizedClip = await getClipById(ids.unauthorized, { channelIds: [SPORTS_CHANNEL_ID] })
    assert(!unauthorizedClip, 'Unauthorized channel clip was accessible.')

    const missingMapping = validateMetricoolConfigForChannel('00000000-0000-0000-0000-000000000000')
    assert(!missingMapping.ok && missingMapping.error.includes('No Metricool brand mapping'), 'Missing mapping did not return a clear error.')

    delete process.env.METRICOOL_TEST_MODE
    delete process.env.METRICOOL_API_URL
    delete process.env.METRICOOL_API_KEY
    delete process.env.METRICOOL_USER_ID
    process.env.METRICOOL_BRAND_RB_SPORTS = 'smoke-rb-sports'
    const missingEnv = validateMetricoolConfigForChannel(SPORTS_CHANNEL_ID)
    const missingLiveEnv = validateMetricoolLiveConfigForChannel(SPORTS_CHANNEL_ID)
    assert(missingEnv.ok, 'Missing Metricool live env should allow dry-run/manual fallback.')
    assert(!missingLiveEnv.ok && missingLiveEnv.error.includes('METRICOOL_API_URL'), 'Missing Metricool live env did not return a clear error.')

    process.env.METRICOOL_TEST_MODE = '1'
    process.env.METRICOOL_BRAND_RB_SPORTS = 'smoke-rb-sports'

    const heldPublish = await callPublishNowRoute(ids.hold)
    const heldSchedule = await callScheduleRoute(ids.hold, new Date(Date.now() + 60 * 60 * 1000).toISOString())
    const rejectedPublish = await callPublishNowRoute(ids.reject)
    const rejectedSchedule = await callScheduleRoute(ids.reject, new Date(Date.now() + 60 * 60 * 1000).toISOString())
    assert(heldPublish.status === 409, `Held clip publish-now returned ${heldPublish.status}, expected 409.`)
    assert(heldSchedule.status === 409, `Held clip schedule returned ${heldSchedule.status}, expected 409.`)
    assert(rejectedPublish.status === 409, `Rejected clip publish-now returned ${rejectedPublish.status}, expected 409.`)
    assert(rejectedSchedule.status === 409, `Rejected clip schedule returned ${rejectedSchedule.status}, expected 409.`)

    const publishResponse = await callPublishNowRoute(ids.publish)
    assert(publishResponse.status === 200 && publishResponse.body?.ok, 'Publish-now route test mode was not accepted.')
    const published = await getClipById(ids.publish, { channelIds: [SPORTS_CHANNEL_ID] })
    assert(
      published?.publish_status === 'ready_for_manual_publish',
      'Publish-now test mode should keep clip ready for manual publish.',
    )

    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const scheduleResponse = await callScheduleRoute(ids.schedule, scheduledAt)
    assert(scheduleResponse.status === 200 && scheduleResponse.body?.ok, 'Schedule route test mode was not accepted.')
    const scheduled = await getClipById(ids.schedule, { channelIds: [SPORTS_CHANNEL_ID] })
    assert(scheduled && effectiveMetricoolStatus(scheduled) === 'ready_for_manual_publish', 'Schedule test mode should keep clip ready for manual publish.')

    const reloadedPublish = await getClipById(ids.publish, { channelIds: [SPORTS_CHANNEL_ID] })
    const reloadedSchedule = await getClipById(ids.schedule, { channelIds: [SPORTS_CHANNEL_ID] })
    assert(reloadedPublish && effectiveMetricoolStatus(reloadedPublish) === effectiveMetricoolStatus(published), 'Publish status failed DB reload.')
    assert(reloadedSchedule && effectiveMetricoolStatus(reloadedSchedule) === 'ready_for_manual_publish', 'Schedule status failed DB reload.')

    const publishHandoff = await readLatestMetricoolHandoffStatus(supabase, ids.publish)
    const scheduleHandoff = await readLatestMetricoolHandoffStatus(supabase, ids.schedule)
    if (publishHandoff.available || scheduleHandoff.available) {
      assert(publishHandoff.publishStatus === 'ready_for_manual_publish', 'Publish handoff dry-run status did not persist to metricool_handoffs.')
      assert(scheduleHandoff.publishStatus === 'ready_for_manual_publish', 'Schedule handoff dry-run status did not persist to metricool_handoffs.')
    } else {
      assert(effectiveMetricoolStatus(reloadedPublish), 'Fallback status reload was empty without metricool_handoffs.')
      assert(effectiveMetricoolStatus(reloadedSchedule), 'Fallback schedule reload was empty without metricool_handoffs.')
    }

    console.log(JSON.stringify(
      {
        result: 'PASS',
        auth: {
          passwordHash: passwordHashUser.username,
          password_hash: passwordSnakeUser.username,
          pin: pinUser.username,
        },
        decisions: {
          approved: approved.status,
          rejected: rejected.status,
          held: held.status,
        },
        metricool: {
          publishNow: effectiveMetricoolStatus(reloadedPublish),
          schedule: effectiveMetricoolStatus(reloadedSchedule),
          handoffTable: publishHandoff.available || scheduleHandoff.available ? 'available' : 'fallback',
          mode: 'test',
        },
      },
      null,
      2,
    ))
  } catch (error) {
    console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
    process.exitCode = 1
  } finally {
    process.env.APP_USERS_JSON = originalAppUsers
    process.env.METRICOOL_TEST_MODE = originalMetricool.testMode
    process.env.METRICOOL_BRAND_RB_SPORTS = originalMetricool.sports
    process.env.METRICOOL_BRAND_RB_ARENA = originalMetricool.arena
    process.env.METRICOOL_API_URL = originalMetricool.apiUrl
    process.env.METRICOOL_API_KEY = originalMetricool.apiKey
    process.env.METRICOOL_USER_ID = originalMetricool.userId
    await supabase.from('clips').delete().in('id', Object.values(ids))
    await closeSharedRedisConnection()
  }
}

void main()

export {}
