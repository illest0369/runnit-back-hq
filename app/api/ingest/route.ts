export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import { ingestChannel } from '@/lib/ingest'
import { consumeRateLimit, getClientIP } from '@/lib/rate-limit'
import { isWarRoomEnabled } from '@/lib/war-room-runtime'

export async function POST(req: NextRequest) {
  if (!isWarRoomEnabled()) {
    return NextResponse.json({ ok: false, error: 'WAR_ROOM_DISABLED' }, { status: 503 })
  }

  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!validateCsrfRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Invalid CSRF token.' }, { status: 403 })
  }

  const rateLimit = await consumeRateLimit({
    scope: 'ingest',
    key: `${session.username.toLowerCase()}:${getClientIP(req)}`,
    limit: 5,
    windowSeconds: 60,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.resetSeconds || 60),
        },
      },
    )
  }

  const { channel_id } = await req.json().catch(() => ({}))
  if (!channel_id) {
    return NextResponse.json({ ok: false, error: 'channel_id required' }, { status: 400 })
  }

  if (!session.channelIds.includes(channel_id) && session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  void ingestChannel(channel_id).catch((error) => {
    console.error('[ingest] background ingest failed', error)
  })

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      channel_id,
      inserted: 0,
      skipped: 0,
      errors: [],
      titles: [],
      partial: false,
      message: 'Ingest accepted.',
    },
    { status: 202 },
  )
}
