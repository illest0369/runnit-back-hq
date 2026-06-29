import { NextResponse } from 'next/server'
import { isWarRoomEnabled } from '@/lib/war-room-runtime'

export async function POST() {
  try {
    if (!isWarRoomEnabled()) {
      return NextResponse.json({ error: 'WAR_ROOM_DISABLED' }, { status: 503 })
    }

    const { requireAppSession } = await import('@/lib/runnitback-server')
    const session = await requireAppSession()

    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { runIngestion } = await import('@/services/sourceIngestionService')
    const result = await runIngestion(session.userId)

    return NextResponse.json(
      { result },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected ingestion error.'
    const status = message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
