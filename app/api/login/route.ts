export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

import { applySessionCookie } from '@/lib/auth'
import {
  authenticateAppUserByEmailPassword,
  authenticateAppUserByPin,
  authenticateConfiguredAppUser,
} from '@/lib/app-users'
import { applyCsrfCookie, generateCsrfToken, validateCsrfRequest } from '@/lib/csrf'
import { isValidPinFormat } from '@/lib/deployment-pin'
import { consumeAuthRateLimit, getClientIP } from '@/lib/rate-limit'
import { assertProductionSecurityRequirements } from '@/lib/security'
import { writeAuditLog } from '@/lib/audit-log'

type LoginBody = {
  email?: string
  username?: string
  pin?: string
  password?: string
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIP(request)

  try {
    assertProductionSecurityRequirements()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid security configuration.'
    await writeAuditLog({
      stage: 'AUTH_SECURITY_ERROR',
      actor: 'system',
      reason: message,
    })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  if (!validateCsrfRequest(request)) {
    await writeAuditLog({
      stage: 'AUTH_CSRF_FAILURE',
      actor: clientIp,
      reason: 'Invalid CSRF token',
    })
    return NextResponse.json({ ok: false, error: 'Invalid CSRF token.' }, { status: 403 })
  }

  const rateLimit = await consumeAuthRateLimit(request, 'login')
  if (!rateLimit.allowed) {
    await writeAuditLog({
      stage: 'AUTH_RATE_LIMIT',
      actor: clientIp,
      reason: `Rate limited - attempt ${rateLimit.count}/${rateLimit.remaining}`,
    })
    return NextResponse.json(
      { ok: false, error: 'Too many attempts. Try again in a minute.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.resetSeconds || 60),
        },
      },
    )
  }

  const body = (await request.json().catch(() => ({}))) as LoginBody
  const email = body.email?.trim().toLowerCase() ?? ''
  const username = body.username?.trim() ?? ''
  const password = body.password?.trim() ?? ''
  const pin = body.pin?.trim() ?? ''
  const loginIdentifier = email || username
  const isEmailPasswordLogin = Boolean(password || email)

  if (isEmailPasswordLogin && (!loginIdentifier || !password)) {
    await writeAuditLog({
      stage: 'AUTH_MISSING_CREDENTIALS',
      actor: clientIp,
      reason: 'Missing email/password',
    })
    return NextResponse.json({ ok: false, error: 'Email and password required.' }, { status: 400 })
  }

  if (!isEmailPasswordLogin && !pin) {
    await writeAuditLog({
      stage: 'AUTH_MISSING_CREDENTIALS',
      actor: clientIp,
      reason: 'Missing PIN',
    })
    return NextResponse.json({ ok: false, error: 'PIN required.' }, { status: 400 })
  }

  if (!isEmailPasswordLogin && !isValidPinFormat(pin)) {
    await writeAuditLog({
      stage: 'AUTH_INVALID_PIN_FORMAT',
      actor: clientIp,
      reason: 'PIN not 6 digits',
    })
    return NextResponse.json({ ok: false, error: 'PIN must be 6 digits.' }, { status: 400 })
  }

  let authenticatedUser = null

  try {
    authenticatedUser = isEmailPasswordLogin
      ? await authenticateAppUserByEmailPassword(loginIdentifier, password)
      : username
        ? await authenticateConfiguredAppUser(username, pin)
        : await authenticateAppUserByPin(pin)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify credentials.'
    await writeAuditLog({
      stage: 'AUTH_VERIFICATION_ERROR',
      actor: loginIdentifier || clientIp,
      reason: message,
    })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  if (!authenticatedUser) {
    await writeAuditLog({
      stage: 'AUTH_INVALID_CREDENTIALS',
      actor: loginIdentifier || clientIp,
      reason: isEmailPasswordLogin ? 'Invalid email/password' : 'Invalid PIN',
    })
    return NextResponse.json(
      { ok: false, error: isEmailPasswordLogin ? 'Invalid email or password.' : 'Invalid PIN.' },
      { status: 401 },
    )
  }

  await writeAuditLog({
    stage: 'AUTH_SUCCESS',
    actor: authenticatedUser.username,
    decision: 'login-success',
    reason: `User ${authenticatedUser.username} logged in from ${clientIp}`,
  })

  const nextCsrfToken = generateCsrfToken()
  const response = NextResponse.json(
    {
      ok: true,
      user: {
        username: authenticatedUser.username,
        role: authenticatedUser.role,
        channelIds: authenticatedUser.channelIds,
      },
      csrfToken: nextCsrfToken,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )

  await applySessionCookie(response, authenticatedUser)
  applyCsrfCookie(response, nextCsrfToken)

  return response
}
