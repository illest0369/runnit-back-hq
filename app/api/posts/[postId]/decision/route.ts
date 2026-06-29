import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import { approveClip, holdClip, rejectClip } from '@/lib/moderation-queue'

type RouteContext = {
  params: Promise<{ postId: string }>
}

type DecisionBody = {
  action?: 'approve' | 'reject' | 'hold'
  time_to_decision?: number
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (session.role !== 'admin' && session.channelIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  if (!validateCsrfRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid CSRF token.' }, { status: 403 })
  }

  const { postId } = await context.params
  const body = (await request.json()) as DecisionBody
  if (body.action !== 'approve' && body.action !== 'reject' && body.action !== 'hold') {
    return NextResponse.json({ ok: false, error: 'action must be approve, reject, or hold' }, { status: 400 })
  }

  const updatedClip =
    body.action === 'approve'
      ? await approveClip(postId, { channelIds: session.channelIds, approvedBy: session.userId })
      : body.action === 'reject'
        ? await rejectClip(postId, { channelIds: session.channelIds })
        : await holdClip(postId, { channelIds: session.channelIds })

  if (!updatedClip) {
    return NextResponse.json({ ok: false, error: 'Clip not found or unavailable for this decision.' }, { status: 404 })
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        post_id: postId,
        action: body.action,
        review_status: updatedClip.status,
        publish_status: updatedClip.publish_status,
        processedAt: updatedClip.updated_at,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
