import type { SessionUser } from './auth-shared'

export type ChannelIdentitySource = 'database' | 'trusted_configuration'

export type ChannelAccessFacts = {
  databaseRole: string | null
  operatorChannelIds: string[]
  allChannelIds: string[]
  identitySource: ChannelIdentitySource
}

export type ResolvedSessionUser = SessionUser & {
  assignedChannelId: string | null
  isSuperAdmin: boolean
}

export class ChannelAccessError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 403) {
    super(message)
    this.name = 'ChannelAccessError'
    this.code = code
    this.status = status
  }
}

function uniqueChannelIds(channelIds: string[]): string[] {
  return [...new Set(channelIds.map((channelId) => channelId.trim()).filter(Boolean))]
}

export function resolveChannelAccess(
  session: SessionUser | null,
  facts: ChannelAccessFacts,
): ResolvedSessionUser | null {
  if (!session) return null

  const role = facts.databaseRole?.trim().toLowerCase()
  const allChannelIds = uniqueChannelIds(facts.allChannelIds)

  if (role === 'admin' || role === 'super_admin') {
    return {
      ...session,
      role: 'admin',
      channelIds: allChannelIds,
      assignedChannelId: null,
      isSuperAdmin: true,
    }
  }

  if (facts.identitySource === 'trusted_configuration') {
    return null
  }

  const operatorChannelIds = uniqueChannelIds(facts.operatorChannelIds)
  if ((role !== 'operator' && role !== 'user') || operatorChannelIds.length !== 1) {
    return null
  }

  return {
    ...session,
    role: 'operator',
    channelIds: operatorChannelIds,
    assignedChannelId: operatorChannelIds[0],
    isSuperAdmin: false,
  }
}

export function canAccessChannel(session: ResolvedSessionUser, channelId: string): boolean {
  return session.channelIds.includes(channelId)
}

export function resolveRequestedChannelId(
  session: ResolvedSessionUser,
  requestedChannelId?: string | null,
): string {
  const requested = requestedChannelId?.trim() || null

  if (!session.isSuperAdmin) {
    if (!session.assignedChannelId) {
      throw new ChannelAccessError('CHANNEL_ASSIGNMENT_REQUIRED', 'A channel assignment is required.')
    }

    if (requested && requested !== session.assignedChannelId) {
      throw new ChannelAccessError('CHANNEL_NOT_FOUND', 'Channel not found.', 404)
    }

    return session.assignedChannelId
  }

  if (!requested) {
    throw new ChannelAccessError('CHANNEL_REQUIRED', 'A channel is required.', 400)
  }

  if (!canAccessChannel(session, requested)) {
    throw new ChannelAccessError('CHANNEL_NOT_FOUND', 'Channel not found.', 404)
  }

  return requested
}
