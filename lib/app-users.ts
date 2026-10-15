import bcrypt from 'bcryptjs'

import type { SessionUser } from './auth'
import { listChannelMeta } from './channel-meta'
import { isProductionRuntime } from './security'
import { supabaseAdminClient } from './supabase-admin'

type Role = SessionUser['role']

type RawAppUser = {
  id?: string
  userId?: string
  username?: string
  email?: string
  role?: string
  channelIds?: unknown
  password?: string
  pin?: string
  passwordHash?: string
  password_hash?: string
  pinHash?: string
  pin_hash?: string
}

type NormalizedAppUser = {
  userId: string
  username: string
  email: string | null
  role: Role
  channelIds: string[]
  plainPassword: string | null
  passwordHash: string | null
  plainPin: string | null
  pinHash: string | null
}

function normalizeRole(value: string | undefined): Role | null {
  if (value === 'super_admin') return 'admin'
  if (value === 'admin' || value === 'operator' || value === 'user') {
    return value
  }

  return null
}

function normalizeChannelIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const channelIds = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue
    }

    const channelId = entry.trim()
    if (channelId) {
      channelIds.add(channelId)
    }
  }

  return [...channelIds]
}

function normalizeAppUser(entry: RawAppUser): NormalizedAppUser | null {
  const username = entry.username?.trim().toLowerCase()
  const email = entry.email?.trim().toLowerCase() || null

  if (!username) {
    return null
  }

  const plainPassword = entry.password?.trim() || null
  const passwordHash = entry.passwordHash?.trim() || entry.password_hash?.trim() || null
  const plainPin = entry.pin?.trim() || null
  const pinHash = entry.pinHash?.trim() || entry.pin_hash?.trim() || null

  if (!plainPassword && !passwordHash && !plainPin && !pinHash) {
    return null
  }
  const role = normalizeRole(entry.role)
  if (!role) return null

  return {
    userId: entry.userId?.trim() || entry.id?.trim() || `env:${username}`,
    username,
    email,
    role,
    channelIds: normalizeChannelIds(entry.channelIds),
    plainPassword,
    passwordHash,
    plainPin,
    pinHash,
  }
}

export function getConfiguredAppUsers(): NormalizedAppUser[] {
  const raw = process.env.APP_USERS_JSON?.trim()

  if (!raw) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('APP_USERS_JSON must be valid JSON.')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('APP_USERS_JSON must be a JSON array.')
  }

  const users = parsed
    .map((entry) => normalizeAppUser(entry as RawAppUser))
    .filter((entry): entry is NormalizedAppUser => Boolean(entry))

  if (
    isProductionRuntime() &&
    users.some(
      (user) =>
        (typeof user.plainPassword === 'string' && user.plainPassword.length > 0) ||
        (typeof user.plainPin === 'string' && user.plainPin.length > 0),
    )
  ) {
    throw new Error('Plaintext APP_USERS_JSON passwords are not allowed in production.')
  }

  return users
}

export async function authenticateConfiguredAppUser(
  username: string,
  secret: string,
): Promise<SessionUser | null> {
  const normalizedUsername = username.trim().toLowerCase()
  const normalizedSecret = secret.trim()

  if (!normalizedUsername || !normalizedSecret) {
    return null
  }

  const user = getConfiguredAppUsers().find((entry) => entry.username === normalizedUsername)
  if (!user) {
    return authenticateDatabaseAppUser(normalizedUsername, normalizedSecret)
  }

  if (!canConfiguredUserAuthenticate(user)) {
    return null
  }

  const matches = await matchesAnyConfiguredSecret(user, normalizedSecret)

  if (!matches) {
    return null
  }

  return {
    userId: user.userId,
    username: user.username,
    role: user.role,
    channelIds: resolveSessionChannelIds(user),
  }
}

export async function authenticateAppUserByEmailPassword(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedPassword = password.trim()

  if (!normalizedEmail || !normalizedPassword) {
    return null
  }

  const configuredUser = getConfiguredAppUsers().find(
    (entry) => entry.email === normalizedEmail || entry.username === normalizedEmail,
  )
  if (configuredUser) {
    if (!canConfiguredUserAuthenticate(configuredUser)) {
      return null
    }

    const matches = await matchesPasswordOnly(configuredUser, normalizedPassword)
    if (!matches) {
      return null
    }

    return sessionUserFromConfiguredUser(configuredUser)
  }

  return authenticateDatabaseAppUserByEmailPassword(normalizedEmail, normalizedPassword)
}

function canConfiguredUserAuthenticate(user: NormalizedAppUser): boolean {
  return user.role === 'admin'
}

export async function authenticateAppUserByPin(secret: string): Promise<SessionUser | null> {
  const normalizedSecret = secret.trim()

  if (!normalizedSecret) {
    return null
  }

  const configuredUsers = getConfiguredAppUsers().filter(canConfiguredUserAuthenticate)
  for (const user of configuredUsers) {
    const matches = await matchesPinOnly(user, normalizedSecret)

    if (!matches) {
      continue
    }

    return sessionUserFromConfiguredUser(user)
  }

  return authenticateDatabaseAppUserByPin(normalizedSecret)
}

async function matchesAnyConfiguredSecret(user: NormalizedAppUser, secret: string): Promise<boolean> {
  return (await matchesPasswordOnly(user, secret)) || (await matchesPinOnly(user, secret))
}

async function matchesPasswordOnly(user: NormalizedAppUser, password: string): Promise<boolean> {
  if (user.passwordHash) {
    return bcrypt.compare(password, user.passwordHash)
  }

  return !isProductionRuntime() && typeof user.plainPassword === 'string' && user.plainPassword === password
}

async function matchesPinOnly(user: NormalizedAppUser, pin: string): Promise<boolean> {
  if (user.pinHash) {
    return bcrypt.compare(pin, user.pinHash)
  }

  return !isProductionRuntime() && typeof user.plainPin === 'string' && user.plainPin === pin
}

function sessionUserFromConfiguredUser(user: NormalizedAppUser): SessionUser {
  return {
    userId: user.userId,
    username: user.username,
    role: user.role,
    channelIds: resolveSessionChannelIds(user),
  }
}

export function resolveConfiguredSessionAccess(
  userId: string,
  username: string,
): Pick<SessionUser, 'role' | 'channelIds'> | null {
  const normalizedUsername = username.trim().toLowerCase()
  const user = getConfiguredAppUsers().find(
    (entry) => entry.userId === userId && entry.username === normalizedUsername,
  )
  if (!user) return null

  if (!canConfiguredUserAuthenticate(user)) return null

  const channelIds = resolveSessionChannelIds(user)

  return { role: user.role, channelIds }
}

async function authenticateDatabaseAppUser(
  username: string,
  secret: string,
): Promise<SessionUser | null> {
  const { data: user, error } = await supabaseAdminClient
    .from('users')
    .select('id, username, pin_hash, role')
    .eq('username', username)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!user?.pin_hash || !(await bcrypt.compare(secret, user.pin_hash))) {
    return null
  }

  const role = normalizeRole(user.role)
  if (!role) return null
  const channelIds = await loadUserChannelIds(user.id)
  if (!canDatabaseUserAuthenticate({ username: user.username, role, channelIds })) {
    return null
  }

  return {
    userId: user.id,
    username: user.username,
    role,
    channelIds: resolveSessionChannelIds({ role, channelIds }),
  }
}

async function authenticateDatabaseAppUserByEmailPassword(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const query = supabaseAdminClient
    .from('users')
    .select('id, username, email, password_hash, role')
    .or(`email.eq.${email},username.eq.${email}`)
    .maybeSingle()

  const { data: user, error } = await query

  if (error) {
    if (isMissingColumnError(error.message)) {
      return null
    }

    throw new Error(error.message)
  }

  if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
    return null
  }

  const role = normalizeRole(user.role)
  if (!role) return null
  const channelIds = await loadUserChannelIds(user.id)
  if (!canDatabaseUserAuthenticate({ username: user.username, role, channelIds })) {
    return null
  }

  return {
    userId: user.id,
    username: user.username,
    role,
    channelIds: resolveSessionChannelIds({ role, channelIds }),
  }
}

function resolveSessionChannelIds(user: Pick<NormalizedAppUser, 'role' | 'channelIds'>): string[] {
  if (user.role === 'admin') return listChannelMeta().map((channel) => channel.id)

  return user.channelIds
}

async function loadUserChannelIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdminClient
    .from('operator_channel_assignments')
    .select('channel_id')
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  return [...new Set(
    (data ?? [])
      .map((row: { channel_id: string | null }) => row.channel_id)
      .filter((value): value is string => Boolean(value)),
  )]
}

function canDatabaseUserAuthenticate(input: {
  username: string
  role: Role
  channelIds: string[]
}): boolean {
  if (input.role === 'admin') {
    return true
  }

  return input.channelIds.length === 1
}

function isMissingColumnError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('column') &&
    (normalized.includes('does not exist') || normalized.includes('could not find'))
  )
}

async function authenticateDatabaseAppUserByPin(secret: string): Promise<SessionUser | null> {
  const { data: users, error } = await supabaseAdminClient
    .from('users')
    .select('id, username, pin_hash, role')
    .in('role', ['operator', 'admin', 'super_admin', 'user'])

  if (error) {
    throw new Error(error.message)
  }

  for (const user of users ?? []) {
    if (!user.pin_hash || !(await bcrypt.compare(secret, user.pin_hash))) {
      continue
    }

    return authenticateDatabaseAppUser(user.username, secret)
  }

  return null
}
