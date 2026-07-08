export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'

import { pollAllSourceChannels } from '@/lib/rss-poll'
import { isWarRoomEnabled } from '@/lib/war-room-runtime'

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function handleCron(request: Request) {
  if (!isWarRoomEnabled()) {
    return NextResponse.json({ ok: false, error: 'WAR_ROOM_DISABLED' }, { status: 503 })
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await pollAllSourceChannels()
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'RSS poll failed.' },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return handleCron(request)
}

export async function POST(request: Request) {
  return handleCron(request)
}
