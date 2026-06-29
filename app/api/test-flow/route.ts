import { NextResponse } from 'next/server'

import { getQueueConnection } from '@/lib/queue'
import { requireAppSession } from '@/lib/runnitback-server'
import { isWarRoomEnabled } from '@/lib/war-room-runtime'

const SAMPLE_VIDEO_URL = 'https://youtube.com/shorts/6s7s40Kxe40'

export async function POST() {
  try {
    if (!isWarRoomEnabled()) {
      return NextResponse.json({ error: 'WAR_ROOM_DISABLED' }, { status: 503 })
    }

    const session = await requireAppSession()

    if (!session.channelIds.length) {
      return NextResponse.json({ error: 'No assigned channel available for test flow.' }, { status: 400 })
    }

    // Force an eager Redis connection check before enqueue so failures are obvious.
    getQueueConnection()

    const { enqueueClipGenerationJob } = await import('@/lib/queue')
    const jobId = await enqueueClipGenerationJob({
      videoUrl: SAMPLE_VIDEO_URL,
      channelId: session.channelIds[0],
      requestedByUserId: session.userId,
    })

    console.log('[api] job enqueued', jobId)

    return NextResponse.json(
      { job_id: jobId },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected test flow error.'
    const status = message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
