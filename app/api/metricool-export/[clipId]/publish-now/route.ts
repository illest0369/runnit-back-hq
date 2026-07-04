export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import { sendClipToMetricool, validateMetricoolConfigForChannel } from '@/lib/metricool'
import {
  getClipById,
  isMetricoolExportReadyStatus,
  updateClipMetricoolStatus,
  type ModerationClip,
} from '@/lib/moderation-queue'

type RouteContext = {
  params: Promise<{ clipId: string }>
}

function responsePayload(clip: ModerationClip, metricool: Awaited<ReturnType<typeof sendClipToMetricool>>) {
  return {
    clipId: clip.id,
    reviewStatus: clip.status,
    publishStatus: clip.publish_status,
    metricoolStatus: metricool.status,
    metricoolPostId: metricool.metricoolPostId,
    updatedAt: clip.updated_at,
  }
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

  const { clipId } = await context.params
  const current = await getClipById(clipId, { channelIds: session.channelIds })
  if (!current) {
    return NextResponse.json({ ok: false, error: 'Clip not found.' }, { status: 404 })
  }

  if (current.status === 'rejected') {
    return NextResponse.json({ ok: false, error: 'Rejected content cannot publish.' }, { status: 409 })
  }

  if (current.status === 'skipped') {
    return NextResponse.json({ ok: false, error: 'Held content must be approved before publishing.' }, { status: 409 })
  }

  if (current.status !== 'approved' || !isMetricoolExportReadyStatus(current.publish_status)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Clip is not approved and ready for Metricool publishing.',
        data: {
          clipId: current.id,
          reviewStatus: current.status,
          publishStatus: current.publish_status,
        },
      },
      { status: 409 },
    )
  }

  if (!current.video_url?.trim()) {
    return NextResponse.json({ ok: false, error: 'Clip is missing a video URL.' }, { status: 409 })
  }

  const config = validateMetricoolConfigForChannel(current.channel_id)
  if (!config.ok) {
    return NextResponse.json({ ok: false, error: config.error }, { status: 424 })
  }

  const metricool = await sendClipToMetricool(current, { mode: 'publish_now' })
  const updated = await updateClipMetricoolStatus(clipId, {
    channelIds: session.channelIds,
    publishStatus: metricool.status === 'accepted' && metricool.publishStatus !== 'needs_clip_render'
      ? metricool.publishStatus
      : 'metricool_failed',
    metricoolPostId: metricool.metricoolPostId,
  })

  if (!updated) {
    return NextResponse.json({ ok: false, error: 'Metricool status could not be persisted.' }, { status: 409 })
  }

  const ok = metricool.status === 'accepted'
  return NextResponse.json(
    { ok, data: responsePayload(updated, metricool), error: ok ? null : metricool.error },
    { status: ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } },
  )
}
