import { cookies } from 'next/headers'
import {
  AUTH_PIN_COOKIE,
  getAuthPinCookieMaxAge,
  hasValidAppPinValue,
} from './deployment-pin'
import {
  readSessionCookie,
  SESSION_COOKIE,
  type SessionUser,
} from './auth-shared'
import { listChannelMeta } from './channel-meta'
import { getSessionSecret } from './security'
import { signSessionPayload } from './session'

export { readSessionCookie, SESSION_COOKIE } from './auth-shared'

const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

type CookieStoreLike = {
  set: (name: string, value: string, options: Record<string, unknown>) => void
  delete: (name: string) => void
}

type CookieTarget = {
  cookies: CookieStoreLike
}

export type { SessionUser } from './auth-shared'

async function serializeSession(user: SessionUser): Promise<string> {
  return signSessionPayload(JSON.stringify(user), getSessionSecret())
}

export function createOwnerSessionUser(): SessionUser {
  return {
    userId: 'app-pin-owner',
    username: 'owner',
    role: 'admin',
    channelIds: listChannelMeta().map((channel) => channel.id),
  }
}

export async function applySessionCookie(response: CookieTarget, user: SessionUser): Promise<void> {
  const value = await serializeSession(user)

  response.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
}

export async function createSession(user: SessionUser): Promise<void> {
  const cookieStore = await cookies()
  await applySessionCookie({ cookies: cookieStore }, user)
}

export async function createDeploymentPinSession(pin: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(AUTH_PIN_COOKIE, pin.trim(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getAuthPinCookieMaxAge(),
  })
}

export async function hasValidDeploymentPin(): Promise<boolean> {
  const cookieStore = await cookies()
  const pin = cookieStore.get(AUTH_PIN_COOKIE)?.value ?? ''
  return hasValidAppPinValue(pin)
}

export function hasValidDeploymentPinFromRequest(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const pin =
    cookieHeader
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${AUTH_PIN_COOKIE}=`))
      ?.slice(AUTH_PIN_COOKIE.length + 1) ?? ''

  return hasValidAppPinValue(decodeURIComponent(pin))
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(SESSION_COOKIE)?.value
  return readSessionCookie(raw)
}

export async function getSessionFromRequest(request: Request): Promise<SessionUser | null> {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const raw =
    cookieHeader
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1)

  return readSessionCookie(raw ? decodeURIComponent(raw) : undefined)
}

export function clearSessionCookie(response: CookieTarget) {
  response.cookies.delete(SESSION_COOKIE)
  response.cookies.delete(AUTH_PIN_COOKIE)
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  clearSessionCookie({ cookies: cookieStore })
}
