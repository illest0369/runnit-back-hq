import { NextResponse } from 'next/server'

import { normalizeRole } from '@/lib/runnitback'
import { getQueueData, requireAppSession } from '@/lib/runnitback-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await requireAppSession()
    const { channels, posts, settings } = await getQueueData(session)

    return NextResponse.json(
      {
        role: normalizeRole(session.role),
        channels,
        posts,
        settings,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected queue error.'
    const status = message === 'Unauthorized' ? 401 : 500

    return NextResponse.json(
      { error: message },
      { status },
    )
  }
}
