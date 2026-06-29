export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { buildPublishExportPackage } from '@/lib/export/build-export'
import { getSession } from '@/lib/auth'
import { getClipById } from '@/lib/moderation-queue'

type RouteContext = {
  params: Promise<{ clipId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (session.role !== 'admin' && session.channelIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const { clipId } = await context.params
  const clip = await getClipById(clipId, { channelIds: session.channelIds })

  if (!clip) {
    return NextResponse.json({ ok: false, error: 'Clip not found' }, { status: 404 })
  }

  if (!clip.video_url) {
    return NextResponse.json(
      { ok: false, error: 'Clip does not have a rendered MP4 yet.' },
      { status: 409 },
    )
  }

  try {
    const exportPackage = buildPublishExportPackage(clip)
    const url = new URL(request.url)

    if (url.searchParams.get('download') === '1') {
      return new NextResponse(JSON.stringify(exportPackage, null, 2), {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="rbhq-export-${clip.id}.json"`,
          'Content-Type': 'application/json; charset=utf-8',
        },
      })
    }

    return NextResponse.json(
      { ok: true, data: exportPackage },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'CLIP_NOT_READY_FOR_EXPORT') {
      return NextResponse.json(
        { ok: false, error: 'Clip must be approved and ready for Metricool before export.' },
        { status: 409 },
      )
    }

    throw error
  }
}
