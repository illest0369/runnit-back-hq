import { NextResponse } from 'next/server'

import { createReplySession, requireAppSession } from '@/lib/runnitback-server'

type RouteContext = {
  params: Promise<{ postId: string }>
}

type ReplySessionBody = {
  commentText?: string
  finalReplyText?: string
  generatedSuggestions?: string[]
  outcomeType?: string
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected reply session error.'
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireAppSession()
    const { postId } = await context.params
    const body = (await request.json()) as ReplySessionBody
    const commentText = body.commentText?.trim() ?? ''
    const finalReplyText = body.finalReplyText?.trim() ?? ''

    if (!commentText || !finalReplyText) {
      return NextResponse.json(
        { error: 'commentText and finalReplyText are required.' },
        { status: 400 },
      )
    }

    const payload = await createReplySession(session, {
      postId,
      commentText,
      finalReplyText,
      generatedSuggestions: Array.isArray(body.generatedSuggestions)
        ? body.generatedSuggestions.filter(
            (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
          )
        : [],
      outcomeType: body.outcomeType?.trim() || 'replied',
    })

    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = getErrorMessage(error)
    const status =
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : message === 'Post not found.' ? 404 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
