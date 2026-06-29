import { NextResponse } from 'next/server'

import {
  generateSuggestionsForPost,
  requireAppSession,
} from '@/lib/runnitback-server'

type RouteContext = {
  params: Promise<{ postId: string }>
}

type SuggestionsBody = {
  commentText?: string
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected suggestion error.'
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireAppSession()
    const { postId } = await context.params
    const body = (await request.json()) as SuggestionsBody
    const commentText = body.commentText?.trim() ?? ''

    if (!commentText) {
      return NextResponse.json(
        { error: 'commentText is required.' },
        { status: 400 },
      )
    }

    const payload = await generateSuggestionsForPost(session, postId, commentText)

    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = getErrorMessage(error)
    const status =
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : message === 'Post not found.' ? 404 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
