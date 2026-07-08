export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'
import { buildDailyContentPlan } from '@/lib/intelligence-v1'
import { getClips, getMetricoolWorkflowClips, getSourceCandidates } from '@/lib/moderation-queue'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (session.role !== 'admin' && session.channelIds.length === 0) {
    return NextResponse.json(
      { ok: true, data: buildDailyContentPlan([]) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const [pendingClips, heldClips, workflowClips, sourceCandidates] = await Promise.all([
    getClips({ limit: 100, channelIds: session.channelIds, status: 'pending' }),
    getClips({ limit: 100, channelIds: session.channelIds, status: 'skipped' }),
    getMetricoolWorkflowClips({ limit: 100, channelIds: session.channelIds }),
    getSourceCandidates({ limit: 20, channelIds: session.channelIds.length > 0 ? session.channelIds : undefined }),
  ])

  const seen = new Set<string>()
  const clips = [...pendingClips, ...heldClips, ...workflowClips].filter((clip) => {
    if (seen.has(clip.id)) return false
    seen.add(clip.id)
    return true
  })

  return NextResponse.json(
    { ok: true, data: buildDailyContentPlan(clips, sourceCandidates) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
