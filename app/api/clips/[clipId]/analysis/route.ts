export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import { refreshClipTikTokAnalysis } from '@/lib/moderation-queue'
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
  const updated = await refreshClipTikTokAnalysis(clipId, { channelIds: session.channelIds })
  if (!updated) {
    return NextResponse.json({ ok: false, error: 'Clip not found.' }, { status: 404 })
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        clipId: updated.id,
        tiktok_analysis: getStoredTikTokAnalysis(updated.moderation_notes),
        vertical_readiness: getTikTokVerticalReadiness(updated),
        updatedAt: updated.updated_at,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
