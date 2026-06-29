import { NextResponse } from 'next/server'

import { savePostPerformance } from '@/lib/clip-db'

type PerformanceWebhookBody = {
  post_id?: string
  postId?: string
  views?: number
  likes?: number
  shares?: number
  watch_time?: number
  watchTime?: number
  collected_at?: string
  collectedAt?: string
}

function readNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isAuthorized(request: Request) {
  const token = process.env.PERFORMANCE_WEBHOOK_TOKEN?.trim()
  if (!token) {
    return false
  }

  const auth = request.headers.get('authorization') ?? ''
  const headerToken = request.headers.get('x-runnitback-token') ?? ''

  return auth === `Bearer ${token}` || headerToken === token
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as PerformanceWebhookBody
    const postId = (body.post_id ?? body.postId)?.trim()

    if (!postId) {
      return NextResponse.json({ ok: false, error: 'post_id required' }, { status: 400 })
    }

    const data = savePostPerformance({
      postId,
      views: readNumber(body.views),
      likes: readNumber(body.likes),
      shares: readNumber(body.shares),
      watchTime: readNumber(body.watch_time ?? body.watchTime),
      collectedAt: body.collected_at ?? body.collectedAt ?? null,
    })

    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected performance ingest error.'
    const status = message === 'Post not found.' ? 404 : 500

    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
