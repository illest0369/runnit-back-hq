export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import { enqueueClipGenerationJob } from '@/lib/queue'
import { isIngestTestEnabled } from '@/lib/security'
import { isWarRoomEnabled } from '@/lib/war-room-runtime'

const SAMPLE_VIDEO_URL = 'https://youtube.com/shorts/6s7s40Kxe40'

export async function POST(request: NextRequest) {
  if (!isWarRoomEnabled()) {
    return NextResponse.json({ ok: false, error: 'WAR_ROOM_DISABLED' }, { status: 503 })
  }

  if (!isIngestTestEnabled()) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }

  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  if (!validateCsrfRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid CSRF token.' }, { status: 403 })
  }

  const jobId = await enqueueClipGenerationJob({
    videoUrl: SAMPLE_VIDEO_URL,
    channelId: session.channelIds[0] ?? 'a1000000-0000-0000-0000-000000000001',
    requestedByUserId: session.userId,
  })

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      job_id: jobId,
    },
    {
      status: 202,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
