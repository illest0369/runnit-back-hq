import { NextResponse } from 'next/server'

import { getAccessibleChannels, requireAppSession } from '@/lib/runnitback-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await requireAppSession()
    const channels = await getAccessibleChannels(session)

    return NextResponse.json(
      { channels },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected channels error.'
    const status = message === 'Unauthorized' ? 401 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
