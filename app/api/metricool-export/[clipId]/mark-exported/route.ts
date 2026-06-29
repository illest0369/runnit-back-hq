export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import {
  getClipById,
  isMetricoolExportReadyStatus,
  isMetricoolExportedStatus,
  type ModerationClip,
  markClipMetricoolPublished,
} from '@/lib/moderation-queue'

type RouteContext = {
  params: Promise<{ clipId: string }>
}

function buildResponsePayload(clip: ModerationClip, idempotent: boolean) {
  return {
    clipId: clip.id,
    reviewStatus: clip.status,
    publishStatus: clip.publish_status,
    exportedAt: clip.manually_published_at,
    updatedAt: clip.updated_at,
    idempotent,
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
    return NextResponse.json(
      { ok: false, error: 'Clip not found.' },
      { status: 404 },
    )
  }

  if (isMetricoolExportedStatus(current.publish_status)) {
    return NextResponse.json(
      { ok: true, data: buildResponsePayload(current, true) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (
    current.status !== 'approved' ||
    !current.video_url?.trim() ||
    (!isMetricoolExportReadyStatus(current.publish_status) && !isMetricoolExportedStatus(current.publish_status))
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Clip is not approved and ready for Metricool export.',
        data: {
          clipId: current.id,
          reviewStatus: current.status,
          publishStatus: current.publish_status,
        },
      },
      { status: 409 },
    )
  }

  const clip = await markClipMetricoolPublished(clipId, { channelIds: session.channelIds })
  if (!clip) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Clip could not be marked exported.',
        data: {
          clipId: current.id,
          reviewStatus: current.status,
          publishStatus: current.publish_status,
        },
      },
      { status: 409 },
    )
  }

  return NextResponse.json(
    { ok: true, data: buildResponsePayload(clip, false) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
