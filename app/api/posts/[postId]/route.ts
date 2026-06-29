import { NextResponse } from 'next/server'

import { getAppPost, updateAppPost } from '@/lib/clip-db'
import { getSession } from '@/lib/auth'
import { type PostWorkflowStatus } from '@/lib/runnitback'

type RouteContext = {
  params: Promise<{ postId: string }>
}

type UpdatePostBody = {
  hook?: string
  caption?: string
  status?: PostWorkflowStatus
  comment_count_hint?: number
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected post error.'
}

function toErrorResponse(error: unknown) {
  const message = getErrorMessage(error)

  if (message === 'Unauthorized') {
    return NextResponse.json({ error: message }, { status: 401 })
  }

  if (message === 'Forbidden') {
    return NextResponse.json({ error: message }, { status: 403 })
  }

  if (message === 'Post not found.') {
    return NextResponse.json({ error: message }, { status: 404 })
  }

  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { postId } = await context.params
    const post = getAppPost(postId)
    if (!post) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
    }
    if (!session.channelIds.includes(post.channel_id) && session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ post }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { postId } = await context.params
    const body = (await request.json()) as UpdatePostBody
    const current = getAppPost(postId)
    if (!current) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
    }
    if (!session.channelIds.includes(current.channel_id) && session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const patch: Record<string, unknown> = {}
    if (typeof body.hook === 'string') {
      patch.hook = body.hook.trim()
    }
    if (typeof body.caption === 'string') {
      patch.caption = body.caption.trim()
    }
    if (typeof body.status === 'string') {
      return NextResponse.json(
        { error: 'Status changes must use the WAR ROOM state machine.' },
        { status: 400 },
      )
    }
    if (typeof body.comment_count_hint === 'number') {
      patch.comment_count_hint = body.comment_count_hint
    }

    const post = updateAppPost(postId, patch)
    if (!post) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
    }

    return NextResponse.json({ post }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return toErrorResponse(error)
  }
}
