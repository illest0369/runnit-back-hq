export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'
import { getSources } from '@/lib/moderation-queue'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (session.role !== 'admin' && session.channelIds.length === 0) {
    return NextResponse.json({ ok: true, data: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const sources = await getSources({ channelIds: session.channelIds })

  return NextResponse.json(
    { ok: true, data: sources },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
