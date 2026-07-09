import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { refreshClipPrepForCandidate } from '@/lib/clip-prep'
import { validateCsrfRequest } from '@/lib/csrf'
import { createMacMiniClipPackageFromCandidate } from '@/lib/mac-mini-handoff'
import { approveClip, getClipById, holdClip, rejectClip } from '@/lib/moderation-queue'
import { extractCandidateIdFromNotes } from '@/lib/operator-queue-readiness'
import { supabaseAdmin } from '@/lib/supabase'

type RouteContext = {
  params: Promise<{ postId: string }>
}

type DecisionBody = {
  action?: 'approve' | 'reject' | 'hold' | 'needs_clip_prep' | 'create_mac_mini_package'
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
  if (
    body.action !== 'approve' &&
    body.action !== 'reject' &&
    body.action !== 'hold' &&
    body.action !== 'needs_clip_prep' &&
    body.action !== 'create_mac_mini_package'
  ) {
    return NextResponse.json({ ok: false, error: 'action must be approve, reject, hold, needs_clip_prep, or create_mac_mini_package' }, { status: 400 })
  }

  if (body.action === 'needs_clip_prep' || body.action === 'create_mac_mini_package') {
    const clip = await getClipById(postId, { channelIds: session.channelIds, includeMetricoolHandoffStatus: false })
    if (!clip) {
      return NextResponse.json({ ok: false, error: 'Clip not found or unavailable for this action.' }, { status: 404 })
    }

    const candidateId = extractCandidateIdFromNotes(clip.moderation_notes)
    if (!candidateId) {
      return NextResponse.json({ ok: false, error: 'Clip is not linked to a persisted Intelligence V1 candidate.' }, { status: 400 })
    }

    if (body.action === 'needs_clip_prep') {
      const refreshed = await refreshClipPrepForCandidate(supabaseAdmin, candidateId)
      return NextResponse.json(
        {
          ok: true,
          data: {
            post_id: postId,
            action: body.action,
            candidate_id: candidateId,
            clip_prep: refreshed.clipPrep,
            transcript: refreshed.transcript,
            safety: refreshed.safety,
          },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const pkg = await createMacMiniClipPackageFromCandidate(supabaseAdmin, candidateId)
    if (session.channelIds.length > 0 && !session.channelIds.includes(pkg.targetChannelId)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          post_id: postId,
          action: body.action,
          candidate_id: candidateId,
          package_id: pkg.id,
          package_status: pkg.packageStatus,
          handoff_status: pkg.handoffStatus,
          asset_status: pkg.assetStatus,
          safety: {
            publishAction: 'dry_run',
            callsMetricool: false,
            uploadsToTikTok: false,
            livePublishStateSet: false,
            clicksFinalPost: false,
          },
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
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
