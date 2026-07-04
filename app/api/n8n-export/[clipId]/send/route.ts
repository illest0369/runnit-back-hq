export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import {
  getClipById,
  isMetricoolExportReadyStatus,
  updateClipAutomationStatus,
  type ModerationClip,
} from '@/lib/moderation-queue'
import { sendClipToN8n, type N8nHandoffResult } from '@/lib/n8n-publisher'

type RouteContext = {
  params: Promise<{ clipId: string }>
}

type SendBody = {
  action?: 'publish_now' | 'schedule'
  scheduledAt?: string
  scheduled_at?: string
}

function parseScheduleTime(value: string | undefined): string | null {
  if (!value?.trim()) return null
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
    return null
  }
  return parsed.toISOString()
}

function responsePayload(clip: ModerationClip, n8n: N8nHandoffResult) {
  return {
    clipId: clip.id,
    reviewStatus: clip.status,
    publishStatus: clip.publish_status,
    n8nStatus: n8n.status,
    responseStatus: n8n.responseStatus,
    updatedAt: clip.updated_at,
  }
}

export async function POST(request: Request, context: RouteContext) {
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

  const body = (await request.json().catch(() => ({}))) as SendBody
  const requestedAction = body.action === 'schedule' ? 'schedule' : 'publish_now'
  const scheduledAt = requestedAction === 'schedule'
    ? parseScheduleTime(body.scheduledAt ?? body.scheduled_at)
    : null

  if (requestedAction === 'schedule' && !scheduledAt) {
    return NextResponse.json({ ok: false, error: 'A future schedule date/time is required.' }, { status: 400 })
  }

  const { clipId } = await context.params
  const current = await getClipById(clipId, { channelIds: session.channelIds })
  if (!current) {
    return NextResponse.json({ ok: false, error: 'Clip not found.' }, { status: 404 })
  }

  if (current.status !== 'approved' || !isMetricoolExportReadyStatus(current.publish_status)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Clip is not approved and ready for n8n automation.',
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

  const n8n = await sendClipToN8n(current, { action: requestedAction, scheduledAt })
  const targetPublishStatus =
    n8n.automationStatus === 'automation_queued'
      ? 'automation_queued'
      : n8n.status === 'sent_to_n8n'
      ? 'sent_to_n8n'
      : n8n.status === 'n8n_failed'
        ? 'automation_failed'
        : null

  const updated = targetPublishStatus
    ? await updateClipAutomationStatus(clipId, {
        channelIds: session.channelIds,
        publishStatus: targetPublishStatus,
      })
    : current

  if (!updated) {
    return NextResponse.json({ ok: false, error: 'n8n status could not be persisted.' }, { status: 409 })
  }

  const ok = n8n.status !== 'n8n_failed'
  return NextResponse.json(
    { ok, data: responsePayload(updated, n8n), error: ok ? null : n8n.error },
    { status: ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } },
  )
}
