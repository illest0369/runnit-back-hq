export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'
import { getChannelMeta } from '@/lib/channel-meta'
import { buildPublishExportPackage } from '@/lib/export/build-export'
import { READY_FOR_EXPORT_STATE, type MetricoolExportItem } from '@/lib/metricool-export-shared'
import { getMetricoolWorkflowClips } from '@/lib/moderation-queue'

function readMetricoolStatus(notes: string[], fallback: string): string {
  return notes.find((note) => note.startsWith('metricool_status:'))?.slice('metricool_status:'.length) ?? fallback
}

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (session.role !== 'admin' && session.channelIds.length === 0) {
    return NextResponse.json({ ok: true, data: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const clips = await getMetricoolWorkflowClips({ limit: 100, channelIds: session.channelIds })
  const data: MetricoolExportItem[] = clips.flatMap((clip) => {
    if (!clip.video_url) return []
    const exportPackage = buildPublishExportPackage(clip)
    const channel = clip.channel_id ? getChannelMeta(clip.channel_id) : null

    const publishStatus = readMetricoolStatus(clip.moderation_notes, clip.publish_status)

    return {
      id: clip.id,
      title: clip.title || clip.hook || 'Untitled clip',
      hook: clip.hook || clip.title || 'Untitled clip',
      caption: exportPackage.caption,
      hashtags: exportPackage.hashtags,
      sourceUrl: clip.source_url,
      channel: channel?.label ?? clip.source_name ?? 'RBHQ',
      channelId: clip.channel_id,
      sourceName: clip.source_name,
      createdAt: clip.created_at,
      approvedAt: clip.approved_at,
      videoUrl: clip.video_url,
      thumbnailUrl: clip.thumbnail_url,
      exportDownloadUrl: `/api/export/${clip.id}?download=1`,
      mediaDownloadUrl: clip.video_url || null,
      exportState: READY_FOR_EXPORT_STATE,
      reviewStatus: clip.status,
      publishStatus,
      manuallyPublishedAt: clip.manually_published_at,
      updatedAt: clip.updated_at,
      exportPackage,
    }
  })

  return NextResponse.json(
    { ok: true, data },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
