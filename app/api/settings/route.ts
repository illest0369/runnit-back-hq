import { NextResponse } from 'next/server'

import { validateCsrfRequest } from '@/lib/csrf'
import {
  ensureUserSettings,
  requireAppSessionFromRequest,
  saveUserSettings,
} from '@/lib/runnitback-server'
import { type AppUserSettings } from '@/lib/runnitback'

type UpdateSettingsBody = Partial<
  Pick<AppUserSettings, 'default_channel_id' | 'notifications_enabled' | 'view_preference'>
>

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected settings error.'
}

function getStatusCode(message: string): number {
  if (message === 'Unauthorized') {
    return 401
  }

  if (message === 'Forbidden') {
    return 403
  }

  return 500
}

export async function GET(request: Request) {
  try {
    const session = await requireAppSessionFromRequest(request)
    const settings = await ensureUserSettings(session)

    return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = getErrorMessage(error)
    return NextResponse.json({ error: message }, { status: getStatusCode(message) })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAppSessionFromRequest(request)
    if (!validateCsrfRequest(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token.' }, { status: 403 })
    }

    const body = (await request.json()) as UpdateSettingsBody

    const settings = await saveUserSettings(session, {
      default_channel_id:
        typeof body.default_channel_id === 'string' || body.default_channel_id === null
          ? body.default_channel_id
          : undefined,
      notifications_enabled:
        typeof body.notifications_enabled === 'boolean'
          ? body.notifications_enabled
          : undefined,
      view_preference:
        body.view_preference === 'comfortable' || body.view_preference === 'compact'
          ? body.view_preference
          : undefined,
    })

    return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = getErrorMessage(error)
    return NextResponse.json({ error: message }, { status: getStatusCode(message) })
  }
}
