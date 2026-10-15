import 'server-only'

import type { SessionUser } from './auth-shared'
import { resolveConfiguredSessionAccess } from './app-users'
import { resolveChannelAccess, type ResolvedSessionUser } from './channel-access'
import { listChannelMeta } from './channel-meta'
import { supabaseAdminClient } from './supabase-admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isDatabaseUserId(userId: string): boolean {
  return UUID_PATTERN.test(userId)
}

async function listDatabaseChannelIds(): Promise<string[]> {
  const { data, error } = await supabaseAdminClient
    .from('channels')
    .select('id')

  if (error) throw new Error(error.message)
  return (data ?? []).map((row: { id: string }) => row.id)
}

async function resolveDatabaseSession(session: SessionUser): Promise<ResolvedSessionUser | null> {
  const { data: user, error: userError } = await supabaseAdminClient
    .from('users')
    .select('role')
    .eq('id', session.userId)
    .maybeSingle()

  if (userError) throw new Error(userError.message)
  if (!user?.role) return null

  const role = String(user.role).toLowerCase()
  if (role === 'admin' || role === 'super_admin') {
    return resolveChannelAccess(session, {
      databaseRole: role,
      operatorChannelIds: [],
      allChannelIds: await listDatabaseChannelIds(),
      identitySource: 'database',
    })
  }

  const { data: assignments, error: assignmentError } = await supabaseAdminClient
    .from('operator_channel_assignments')
    .select('channel_id')
    .eq('user_id', session.userId)

  if (assignmentError) throw new Error(assignmentError.message)

  return resolveChannelAccess(session, {
    databaseRole: role,
    operatorChannelIds: (assignments ?? []).map(
      (row: { channel_id: string }) => row.channel_id,
    ),
    allChannelIds: [],
    identitySource: 'database',
  })
}

function resolveTrustedSession(session: SessionUser): ResolvedSessionUser | null {
  if (session.userId === 'app-pin-owner' && session.role === 'admin') {
    return resolveChannelAccess(session, {
      databaseRole: 'super_admin',
      operatorChannelIds: [],
      allChannelIds: listChannelMeta().map((channel) => channel.id),
      identitySource: 'trusted_configuration',
    })
  }

  const configured = resolveConfiguredSessionAccess(session.userId, session.username)
  if (!configured) return null

  return resolveChannelAccess(session, {
    databaseRole: configured.role,
    operatorChannelIds: configured.channelIds,
    allChannelIds: listChannelMeta().map((channel) => channel.id),
    identitySource: 'trusted_configuration',
  })
}

export async function resolveServerSession(
  session: SessionUser | null,
): Promise<ResolvedSessionUser | null> {
  if (!session) return null
  return isDatabaseUserId(session.userId)
    ? resolveDatabaseSession(session)
    : resolveTrustedSession(session)
}
