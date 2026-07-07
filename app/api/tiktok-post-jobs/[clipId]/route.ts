export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import { enqueueClipForTikTokPosting, getClipById } from '@/lib/moderation-queue'
import { getStoredTikTokAnalysis, getTikTokVerticalReadiness } from '@/lib/tiktok-analyzer'

type RouteContext = {
  params: Promise<{ clipId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!validateCsrfRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid CSRF token.' }, { status: 403 })
  }

  const { clipId } = await context.params
  const queued = await enqueueClipForTikTokPosting(clipId, { channelIds: session.channelIds })
  if (!queued) {
    const current = await getClipById(clipId, { channelIds: session.channelIds, includeMetricoolHandoffStatus: false })
    return NextResponse.json(
      {
        ok: false,
        error: 'Clip is not approved, captioned, vertical-ready, or available for this lane.',
        data: current
          ? {
              reviewStatus: current.status,
              publishStatus: current.publish_status,
              tiktok_analysis: getStoredTikTokAnalysis(current.moderation_notes),
              vertical_readiness: getTikTokVerticalReadiness(current),
            }
          : null,
      },
      { status: current ? 409 : 404 },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        clipId: queued.id,
        reviewStatus: queued.status,
        publishStatus: queued.publish_status,
        queued: true,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
