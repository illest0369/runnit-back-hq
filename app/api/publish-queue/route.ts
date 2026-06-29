export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { buildPublishExportPackage } from '@/lib/export/build-export'
import { getSession } from '@/lib/auth'
import { getMetricoolWorkflowClips } from '@/lib/moderation-queue'

// Metricool-only alias kept for older clients. Prefer /api/metricool-export.
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (session.role !== 'admin' && session.channelIds.length === 0) {
    return NextResponse.json({ ok: true, data: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const clips = await getMetricoolWorkflowClips({ limit: 100, channelIds: session.channelIds })
  const data = clips.flatMap((clip) => {
    if (!clip.video_url) return []

    return [{
      ...clip,
      export_package: buildPublishExportPackage(clip),
    }]
  })

  return NextResponse.json(
    { ok: true, data },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
