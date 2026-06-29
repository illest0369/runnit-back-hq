export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  getAppPost,
  getPostChannelId,
  updatePostReviewStatus,
} from '@/lib/clip-db'
import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import { writeAuditLog } from '@/lib/audit-log'
import { enqueueClipGenerationJob } from '@/lib/queue'
import { normalizeClipState, transitionClipState } from '@/lib/state-machine'
import { validateSystemGuard } from '@/lib/system-guard'
import { supabaseAdmin } from '@/lib/supabase'

type ApprovalRequest = {
  post_id?: string
  action?: 'approve' | 'reject'
}

type SupabaseApprovalPost = {
  id: string
  clip_id: string | null
  channel_id: string | null
  video_url: string | null
  source_video_url: string | null
  hook: string | null
  caption: string | null
  hashtags: string[] | string | null
  status: string | null
  start_time: number | null
  end_time: number | null
  approved_by_user_id?: string | null
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!validateCsrfRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid CSRF token.' }, { status: 403 })
  }

  let body: ApprovalRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.post_id || !body.action) {
    return NextResponse.json({ ok: false, error: 'Missing post_id or action' }, { status: 400 })
  }

  let { data: supabasePost, error: supabasePostError } = await supabaseAdmin
    .from('posts')
    .select('id, clip_id, channel_id, video_url, source_video_url, hook, caption, hashtags, status, start_time, end_time, approved_by_user_id')
    .eq('id', body.post_id)
    .maybeSingle()

  if (supabasePostError?.message.includes('approved_by_user_id')) {
    ;({ data: supabasePost, error: supabasePostError } = await supabaseAdmin
      .from('posts')
      .select('id, clip_id, channel_id, video_url, source_video_url, hook, caption, hashtags, status, start_time, end_time, approved_by')
      .eq('id', body.post_id)
      .maybeSingle())
  }

  if (supabasePostError?.message.includes('approved_by')) {
    ;({ data: supabasePost, error: supabasePostError } = await supabaseAdmin
      .from('posts')
      .select('id, clip_id, channel_id, video_url, source_video_url, hook, caption, hashtags, status, start_time, end_time')
      .eq('id', body.post_id)
      .maybeSingle())
  }

  if (supabasePostError) {
    return NextResponse.json({ ok: false, error: supabasePostError.message }, { status: 500 })
  }

  const typedSupabasePost = supabasePost as SupabaseApprovalPost | null
  const channelId = typedSupabasePost?.channel_id ?? getPostChannelId(body.post_id)
  if (!channelId) {
    return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 })
  }

  if (!session.channelIds.includes(channelId) && session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const reviewStatus = body.action === 'approve' ? 'approved' : 'rejected'
  const processedAt = new Date().toISOString()
  let workerJobId: string | null = null

  if (typedSupabasePost) {
    const currentState = normalizeClipState(typedSupabasePost.status)
    if (currentState !== 'AI_DECISION') {
      await writeAuditLog({
        clip_id: body.post_id,
        post_id: body.post_id,
        stage: 'HUMAN_APPROVAL',
        actor: `human:${session.userId}`,
        decision: 'BLOCKED',
        from_state: currentState,
        reason: 'APPROVAL_REQUIRES_AI_DECISION_STATE',
      })
      return NextResponse.json(
        { ok: false, error: 'Approval requires AI_DECISION state.' },
        { status: 409 },
      )
    }

    if (body.action === 'approve') {
      if (!session.userId) {
        return NextResponse.json(
          { ok: false, error: 'approved_by_user_id is required.' },
          { status: 400 },
        )
      }

      const missingTimestamps =
        typedSupabasePost.start_time === null || typedSupabasePost.end_time === null

      if (missingTimestamps) {
        const sourceVideoUrl = typedSupabasePost.source_video_url ?? typedSupabasePost.video_url
        if (!sourceVideoUrl) {
          return NextResponse.json({ ok: false, error: 'Missing source video URL' }, { status: 400 })
        }

        workerJobId = await enqueueClipGenerationJob({
          videoUrl: sourceVideoUrl,
          channelId,
          requestedByUserId: session.userId,
        })

        await supabaseAdmin
          .from('posts')
          .update({
            review_status: 'approved',
            status: 'approved',
            updated_at: processedAt,
          })
          .eq('id', body.post_id)

        if (typedSupabasePost.clip_id) {
          await supabaseAdmin
            .from('queue_jobs')
            .update({ status: 'approved', updated_at: processedAt })
            .eq('id', typedSupabasePost.clip_id)
        }

        await writeAuditLog({
          clip_id: body.post_id,
          post_id: body.post_id,
          stage: 'HUMAN_APPROVAL',
          actor: `human:${session.userId}`,
          decision: 'APPROVE',
          from_state: currentState,
          to_state: 'APPROVED_BY_HUMAN',
          reason: 'HUMAN_APPROVED_SOURCE_FOR_GENERATION',
        })
      } else {
        const guard = await validateSystemGuard({
        id: typedSupabasePost.id,
        source_video_url: typedSupabasePost.source_video_url ?? typedSupabasePost.video_url,
        hook: typedSupabasePost.hook,
        caption: typedSupabasePost.caption,
        hashtags: typedSupabasePost.hashtags,
        aspect_ratio: '9:16',
        timestamp_start: typedSupabasePost.start_time,
        timestamp_end: typedSupabasePost.end_time,
        })

        if (!guard.ok) {
          return NextResponse.json({ ok: false, error: guard.reason }, { status: 422 })
        }

        await transitionClipState({
          clipId: body.post_id,
          currentState,
          nextState: 'APPROVED_BY_HUMAN',
          actor: { type: 'human', id: session.userId },
          reason: 'HUMAN_APPROVAL_RECORDED',
        })
      }
    } else {
      await transitionClipState({
        clipId: body.post_id,
        currentState,
        nextState: 'REJECTED',
        actor: { type: 'human', id: session.userId },
        reason: 'HUMAN_REJECTION_RECORDED',
      })
    }

    await writeAuditLog({
      clip_id: body.post_id,
      post_id: body.post_id,
      stage: 'HUMAN_APPROVAL',
      actor: `human:${session.userId}`,
      decision: body.action.toUpperCase(),
      from_state: currentState,
      to_state: body.action === 'approve' ? 'APPROVED_BY_HUMAN' : 'REJECTED',
      reason: 'MANUAL_OPERATOR_DECISION',
    })
  } else {
    const sqlitePost = getAppPost(body.post_id)
    if (!sqlitePost) {
      return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 })
    }

    const currentState = normalizeClipState(sqlitePost?.status)
    if (currentState !== 'AI_DECISION') {
      return NextResponse.json(
        { ok: false, error: 'Approval requires AI_DECISION state.' },
        { status: 409 },
      )
    }

    if (body.action === 'approve') {
      const guard = await validateSystemGuard({
        id: sqlitePost?.id,
        source_video_url: sqlitePost?.source_video_url ?? sqlitePost?.video_url,
        hook: sqlitePost?.hook,
        caption: sqlitePost?.caption,
        hashtags: sqlitePost?.hashtags,
        aspect_ratio: '9:16',
        timestamp_start: sqlitePost?.start_time,
        timestamp_end: sqlitePost?.end_time,
      })

      if (!guard.ok) {
        return NextResponse.json({ ok: false, error: guard.reason }, { status: 422 })
      }
    }

    updatePostReviewStatus(
      body.post_id,
      body.action === 'approve' ? 'approved' : 'rejected',
      session.userId,
    )
  }

  return NextResponse.json({
    ok: true,
    data: {
      post_id: body.post_id,
      action: body.action,
      review_status: reviewStatus,
      processedAt,
      worker_job_id: workerJobId,
    },
  })
}
