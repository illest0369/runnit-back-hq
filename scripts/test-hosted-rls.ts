import { randomBytes, randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

type ChannelRow = {
  id: string
  name: string
  handle: string
}

type SmokeOperator = {
  authUserId: string
  channel: ChannelRow
  client: SupabaseClient
}

type SmokeAdmin = {
  authUserId: string
  client: SupabaseClient
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function requiredEnv(name: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY') {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

function assertStagingTarget(supabaseUrl: string) {
  const stagingConfirmed =
    process.env.RBHQ_STAGING_EPHEMERAL_SUPABASE === 'true' ||
    process.env.RBHQ_STAGING_ALLOW_HOSTED_RLS === 'true'
  assert(
    stagingConfirmed,
    'Refusing hosted RLS smoke test without an explicit staging marker.',
  )

  const hostname = new URL(supabaseUrl).hostname
  assert(hostname !== 'localhost' && hostname !== '127.0.0.1', 'Hosted RLS test requires a hosted endpoint.')
}

async function createSmokeOperator(
  admin: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  channel: ChannelRow,
  label: string,
): Promise<SmokeOperator> {
  const suffix = randomUUID()
  const email = `rbhq-rls-${label}-${suffix}@example.invalid`
  const password = `Rbhq!${randomBytes(24).toString('base64url')}`
  const username = `rls-${label}-${suffix}`
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: 'rbhq-phase1-hosted-rls-smoke' },
  })

  if (created.error || !created.data.user) {
    throw new Error(created.error?.message || `Failed to create ${label} auth user.`)
  }

  const authUserId = created.data.user.id
  try {
    const profile = await admin.from('users').insert({
      id: authUserId,
      username,
      role: 'operator',
      pin_hash: 'staging-smoke-account-no-pin-login',
    })
    if (profile.error) throw new Error(profile.error.message)

    const assignment = await admin.from('operator_channel_assignments').insert({
      user_id: authUserId,
      channel_id: channel.id,
    })
    if (assignment.error) throw new Error(assignment.error.message)

    const loginClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const login = await loginClient.auth.signInWithPassword({ email, password })
    if (login.error || !login.data.session) {
      throw new Error(login.error?.message || `Failed to authenticate ${label} smoke operator.`)
    }

    return {
      authUserId,
      channel,
      client: createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${login.data.session.access_token}` } },
      }),
    }
  } catch (error) {
    await admin.from('operator_channel_assignments').delete().eq('user_id', authUserId)
    await admin.from('users').delete().eq('id', authUserId)
    await admin.auth.admin.deleteUser(authUserId)
    throw error
  }
}

async function createSmokeAdmin(
  admin: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<SmokeAdmin> {
  const suffix = randomUUID()
  const email = `rbhq-rls-admin-${suffix}@example.invalid`
  const password = `Rbhq!${randomBytes(24).toString('base64url')}`
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: 'rbhq-phase1-hosted-admin-smoke' },
  })

  if (created.error || !created.data.user) {
    throw new Error(created.error?.message || 'Failed to create admin smoke user.')
  }

  const authUserId = created.data.user.id
  try {
    const profile = await admin.from('users').insert({
      id: authUserId,
      username: `rls-admin-${suffix}`,
      role: 'admin',
      pin_hash: 'staging-smoke-account-no-pin-login',
    })
    if (profile.error) throw new Error(profile.error.message)

    const loginClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const login = await loginClient.auth.signInWithPassword({ email, password })
    if (login.error || !login.data.session) {
      throw new Error(login.error?.message || 'Failed to authenticate admin smoke user.')
    }

    return {
      authUserId,
      client: createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${login.data.session.access_token}` } },
      }),
    }
  } catch (error) {
    await admin.from('users').delete().eq('id', authUserId)
    await admin.auth.admin.deleteUser(authUserId)
    throw error
  }
}

async function verifyOperatorIsolation(operator: SmokeOperator, foreignChannel: ChannelRow) {
  const channels = await operator.client.from('channels').select('id, name, handle')
  assert(!channels.error, channels.error?.message || 'Assigned channel query failed.')
  assert(channels.data?.length === 1, 'Operator did not receive exactly one channel.')
  assert(channels.data[0]?.id === operator.channel.id, 'Operator received the wrong channel.')

  const assignments = await operator.client
    .from('operator_channel_assignments')
    .select('user_id, channel_id')
  assert(!assignments.error, assignments.error?.message || 'Assignment query failed.')
  assert(assignments.data?.length === 1, 'Operator did not receive exactly one assignment.')
  assert(assignments.data[0]?.user_id === operator.authUserId, 'Operator saw another user assignment.')
  assert(assignments.data[0]?.channel_id === operator.channel.id, 'Operator assignment channel drifted.')

  const users = await operator.client.from('users').select('id, username, role')
  assert(!users.error, users.error?.message || 'User self-query failed.')
  assert(users.data?.length === 1, 'Operator saw another user profile.')
  assert(users.data[0]?.id === operator.authUserId, 'Operator self profile did not match auth identity.')

  const foreignRead = await operator.client
    .from('source_suggestions')
    .select('id')
    .eq('channel_id', foreignChannel.id)
  assert(!foreignRead.error, foreignRead.error?.message || 'Foreign-channel read probe failed.')
  assert(foreignRead.data?.length === 0, 'Operator read a foreign-channel suggestion.')

  const deniedWrite = await operator.client.from('source_suggestions').insert({
    channel_id: foreignChannel.id,
    operator_id: operator.authUserId,
    source_url: `https://example.invalid/denied-${randomUUID()}`,
    source_title: 'RBHQ hosted RLS denied-write probe',
    reasoning: ['Expected RLS denial.'],
    metadata: { smoke: true, expected: 'denied' },
  })
  assert(Boolean(deniedWrite.error), 'Foreign-channel write unexpectedly succeeded.')

  const allowedWrite = await operator.client
    .from('source_suggestions')
    .insert({
      channel_id: operator.channel.id,
      operator_id: operator.authUserId,
      source_url: `https://example.invalid/allowed-${randomUUID()}`,
      source_title: 'RBHQ hosted RLS allowed-write probe',
      reasoning: ['Expected assigned-channel success.'],
      metadata: { smoke: true, expected: 'allowed' },
    })
    .select('id, channel_id')
    .single()
  assert(!allowedWrite.error, allowedWrite.error?.message || 'Assigned-channel write was denied.')
  assert(allowedWrite.data?.channel_id === operator.channel.id, 'Allowed write changed channel scope.')

  return {
    assignedChannel: operator.channel.name,
    visibleChannels: channels.data.length,
    visibleAssignments: assignments.data.length,
    visibleUsers: users.data.length,
    foreignReadRows: foreignRead.data?.length ?? null,
    foreignWriteDenied: Boolean(deniedWrite.error),
    assignedWriteAllowed: true,
  }
}

async function verifyAdminAccess(
  smokeAdmin: SmokeAdmin,
  channels: ChannelRow[],
  smokeOperators: SmokeOperator[],
) {
  const visibleChannels = await smokeAdmin.client
    .from('channels')
    .select('id, name, handle')
    .order('name')
  assert(!visibleChannels.error, visibleChannels.error?.message || 'Admin channel query failed.')
  assert(
    visibleChannels.data?.length === channels.length,
    'Admin did not receive every channel.',
  )

  const assignments = await smokeAdmin.client
    .from('operator_channel_assignments')
    .select('user_id, channel_id')
  assert(!assignments.error, assignments.error?.message || 'Admin assignment query failed.')
  for (const operator of smokeOperators) {
    assert(
      assignments.data?.some((row) => row.user_id === operator.authUserId),
      `Admin could not read the ${operator.channel.name} smoke assignment.`,
    )
  }

  const writeChannels = smokeOperators.map((operator) => operator.channel)
  const createdSuggestionIds: string[] = []
  for (const channel of writeChannels) {
    const insert = await smokeAdmin.client
      .from('source_suggestions')
      .insert({
        channel_id: channel.id,
        operator_id: smokeAdmin.authUserId,
        source_url: `https://example.invalid/admin-${channel.id}-${randomUUID()}`,
        source_title: `Admin access probe for ${channel.name}`,
        reasoning: ['Expected administrator cross-channel success.'],
        metadata: { smoke: true, expected: 'admin-allowed' },
      })
      .select('id, channel_id')
      .single()
    assert(!insert.error, insert.error?.message || `Admin write failed for ${channel.name}.`)
    assert(insert.data?.channel_id === channel.id, `Admin write changed ${channel.name} scope.`)
    createdSuggestionIds.push(insert.data.id)
  }

  const readBack = await smokeAdmin.client
    .from('source_suggestions')
    .select('id, channel_id')
    .in('id', createdSuggestionIds)
  assert(!readBack.error, readBack.error?.message || 'Admin cross-channel read failed.')
  assert(readBack.data?.length === createdSuggestionIds.length, 'Admin did not read both channel probes.')

  return {
    visibleChannels: visibleChannels.data?.length ?? null,
    expectedChannels: channels.length,
    smokeAssignmentsVisible: smokeOperators.length,
    crossChannelWritesAllowed: createdSuggestionIds.length,
    crossChannelReadsAllowed: readBack.data?.length ?? null,
  }
}

async function main() {
  const supabaseUrl = requiredEnv('SUPABASE_URL')
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  assertStagingTarget(supabaseUrl)
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const operators: SmokeOperator[] = []
  let smokeAdmin: SmokeAdmin | null = null

  try {
    const channelsResult = await admin.from('channels').select('id, name, handle').order('name')
    if (channelsResult.error) throw new Error(channelsResult.error.message)
    const channels = (channelsResult.data ?? []) as ChannelRow[]
    const rbCfb = channels.find(
      (channel) => channel.name.toLowerCase() === 'rb cfb' && channel.handle.toLowerCase() === 'runnitbackcfb',
    )
    const foreign = channels.find((channel) => channel.id !== rbCfb?.id)
    assert(rbCfb, 'RB CFB channel was not found.')
    assert(foreign, 'A foreign channel was not available for cross-channel testing.')

    const operatorA = await createSmokeOperator(admin, supabaseUrl, serviceRoleKey, rbCfb, 'rb-cfb')
    operators.push(operatorA)
    const operatorB = await createSmokeOperator(admin, supabaseUrl, serviceRoleKey, foreign, 'foreign')
    operators.push(operatorB)
    smokeAdmin = await createSmokeAdmin(admin, supabaseUrl, serviceRoleKey)

    const [operatorAEvidence, operatorBEvidence, adminEvidence] = await Promise.all([
      verifyOperatorIsolation(operatorA, foreign),
      verifyOperatorIsolation(operatorB, rbCfb),
      verifyAdminAccess(smokeAdmin, channels, operators),
    ])

    console.log(JSON.stringify({
      result: 'PASS',
      endpointHost: new URL(supabaseUrl).host,
      admin: adminEvidence,
      operators: [operatorAEvidence, operatorBEvidence],
      cleanupPlanned: true,
    }, null, 2))
  } finally {
    if (smokeAdmin) {
      await admin.from('source_suggestions').delete().eq('operator_id', smokeAdmin.authUserId)
      await admin.from('users').delete().eq('id', smokeAdmin.authUserId)
      await admin.auth.admin.deleteUser(smokeAdmin.authUserId)
    }
    for (const operator of operators.reverse()) {
      await admin.from('source_suggestions').delete().eq('operator_id', operator.authUserId)
      await admin.from('operator_channel_assignments').delete().eq('user_id', operator.authUserId)
      await admin.from('users').delete().eq('id', operator.authUserId)
      await admin.auth.admin.deleteUser(operator.authUserId)
    }
  }
}

void main().catch((error) => {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
