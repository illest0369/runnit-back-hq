import bcrypt from 'bcryptjs'

import type { SessionUser } from './auth'
import { getChannelMeta } from './channel-meta'
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

const RBHQ_OPERATOR_USERNAMES = new Set([
  'rb_sports',
  'rb_arena',
  'rb_women',
  'rb_combat',
  'rb_futbol',
  'rb_cfb',
])

const RB_WOMEN_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000004'
const RB_COMBAT_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000003'
const RB_FUTBOL_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000005'
const MALY_ASSIGNED_CHANNEL_IDS = [
  RB_WOMEN_CHANNEL_ID,
  RB_COMBAT_CHANNEL_ID,
  RB_FUTBOL_CHANNEL_ID,
]
const EXTRA_APP_CHANNEL_IDS = new Set([RB_FUTBOL_CHANNEL_ID])
const MALY_USERNAMES = new Set(['maly', 'malyhernandez'])

function normalizeRole(value: string | undefined): Role {
  if (value === 'admin' || value === 'operator' || value === 'user') {
    return value
  }

  return 'operator'
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
    if (channelId && isKnownAppChannelId(channelId)) {
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

  return {
    userId: entry.userId?.trim() || entry.id?.trim() || `env:${username}`,
    username,
    email,
    role: normalizeRole(entry.role),
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
  if (user.role === 'admin') {
    return true
  }

  if (RBHQ_OPERATOR_USERNAMES.has(user.username)) {
    return true
  }

  return user.channelIds.length > 0
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
  const channelIds = await loadUserChannelIds(user.id)
  if (!canDatabaseUserAuthenticate({ username: user.username, role, channelIds })) {
    return null
  }

  return {
    userId: user.id,
    username: user.username,
    role,
    channelIds: resolveSessionChannelIds({ username: user.username, role, channelIds }),
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
  const channelIds = await loadUserChannelIds(user.id)
  if (!canDatabaseUserAuthenticate({ username: user.username, role, channelIds })) {
    return null
  }

  return {
    userId: user.id,
    username: user.username,
    role,
    channelIds: resolveSessionChannelIds({ username: user.username, role, channelIds }),
  }
}

function resolveSessionChannelIds(user: Pick<NormalizedAppUser, 'username' | 'role' | 'channelIds'>): string[] {
  if (isMalyUser(user.username)) {
    return MALY_ASSIGNED_CHANNEL_IDS
  }

  if (user.role === 'admin' && user.channelIds.length === 0) {
    return MALY_ASSIGNED_CHANNEL_IDS
  }

  return user.channelIds
}

function isMalyUser(username: string): boolean {
  return MALY_USERNAMES.has(username.trim().toLowerCase())
}

function isKnownAppChannelId(channelId: string): boolean {
  return Boolean(getChannelMeta(channelId) || EXTRA_APP_CHANNEL_IDS.has(channelId))
}

async function loadUserChannelIds(userId: string): Promise<string[]> {
  const [{ data: accessRows, error: accessError }, { data: legacyRows, error: legacyError }] = await Promise.all([
    supabaseAdminClient
      .from('user_channel_access')
      .select('channel_id')
      .eq('user_id', userId),
    supabaseAdminClient
      .from('user_channels')
      .select('channel_id')
      .eq('user_id', userId),
  ])

  if (accessError && !isMissingRelationError(accessError.message)) {
    throw new Error(accessError.message)
  }
  if (legacyError && !isMissingRelationError(legacyError.message)) {
    throw new Error(legacyError.message)
  }

  const channelIds = [
    ...new Set(
      [...(accessRows ?? []), ...(legacyRows ?? [])]
        .map((row: { channel_id: string | null }) => row.channel_id)
        .filter((value): value is string => Boolean(value && getChannelMeta(value))),
    ),
  ]

  return channelIds
}

function canDatabaseUserAuthenticate(input: {
  username: string
  role: Role
  channelIds: string[]
}): boolean {
  if (input.role === 'admin') {
    return true
  }

  if (RBHQ_OPERATOR_USERNAMES.has(input.username)) {
    return true
  }

  return input.channelIds.length > 0
}

function isMissingRelationError(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('does not exist') || normalized.includes('could not find the table')
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
    .in('role', ['operator', 'admin', 'user'])

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
