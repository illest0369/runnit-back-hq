import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getChannelMeta } from '@/lib/channel-meta'
import { requireAppSession } from '@/lib/runnitback-server'
import { isWarRoomEnabled } from '@/lib/war-room-runtime'
import { createSourceSuggestion } from '@/services/sourceSuggestionService'

const GenerateClipsSchema = z.object({
  video_url: z.string().url(),
  channel_id: z.string().refine((value) => Boolean(getChannelMeta(value)), 'Invalid channel_id'),
})

export async function GET(request: Request) {
  try {
    const session = await requireAppSession()
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('job_id')?.trim()

    if (!jobId) {
      return NextResponse.json({ error: 'job_id is required.' }, { status: 400 })
    }

    const { getClipGenerationJobStatus } = await import('@/lib/queue')
    const job = await getClipGenerationJobStatus(jobId)
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
    }

    if (!session.channelIds.includes(job.data.channelId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ job }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected job lookup error.'
    const status = message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: Request) {
  try {
    if (!isWarRoomEnabled()) {
      return NextResponse.json({ error: 'WAR_ROOM_DISABLED' }, { status: 503 })
    }

    const session = await requireAppSession()
    const body = GenerateClipsSchema.parse(await request.json())

    if (!session.channelIds.includes(body.channel_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sourceSuggestion = await createSourceSuggestion({
      channelId: body.channel_id,
      operatorId: session.userId,
      sourceUrl: body.video_url,
    })

    const { enqueueClipGenerationJob } = await import('@/lib/queue')
    const jobId = await enqueueClipGenerationJob({
      videoUrl: body.video_url,
      channelId: body.channel_id,
      requestedByUserId: session.userId,
      sourceSuggestionId: sourceSuggestion.sourceSuggestionId,
    })
    console.log('[api] job enqueued', jobId)

    return NextResponse.json(
      {
        job_id: jobId,
        source_suggestion_id: sourceSuggestion.sourceSuggestionId,
        source_score: sourceSuggestion.initialScore,
        source_metadata: {
          title: sourceSuggestion.metadata.title,
          author: sourceSuggestion.metadata.author,
          duration_seconds: sourceSuggestion.metadata.durationSeconds,
          thumbnail_url: sourceSuggestion.metadata.thumbnailUrl,
        },
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Invalid request body.' },
        { status: 400 },
      )
    }

    const message = error instanceof Error ? error.message : 'Unexpected enqueue error.'
    const status = message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
