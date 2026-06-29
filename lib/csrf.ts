import { randomBytes, timingSafeEqual } from 'node:crypto'
import { CSRF_COOKIE, CSRF_HEADER } from './csrf-constants'

export { CSRF_COOKIE, CSRF_HEADER }

type CookieTarget = {
  cookies: {
    set: (name: string, value: string, options: Record<string, unknown>) => void
  }
}

function readCookie(request: Request, name: string): string {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const raw = cookieHeader
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1)

  return raw ? decodeURIComponent(raw) : ''
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex')
}

export function applyCsrfCookie(response: CookieTarget, token: string): void {
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
}

export function validateCsrfRequest(request: Request): boolean {
  const cookieToken = readCookie(request, CSRF_COOKIE)
  const headerToken = request.headers.get(CSRF_HEADER) ?? ''

  if (!cookieToken || !headerToken) {
    return false
  }

  const cookieBuffer = Buffer.from(cookieToken)
  const headerBuffer = Buffer.from(headerToken)

  return (
    cookieBuffer.length === headerBuffer.length &&
    timingSafeEqual(cookieBuffer, headerBuffer)
  )
}
