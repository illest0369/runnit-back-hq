// LEGACY — not used in active ingest pipeline
import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected settings context error.'
}

function getStatusCode(message: string): number {
  if (message === 'Unauthorized') {
    return 401
  }

  if (message === 'Forbidden') {
    return 403
  }

  return 500
}

export async function GET(request: Request) {
  try {
    const currentSession = await getSessionFromRequest(request)
    if (!currentSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { hasSupabaseEnv } = await import('@/lib/supabase')

    if (!hasSupabaseEnv) {
      return NextResponse.json(
        {
          channels: [],
          settings: {
            id: 'build-fallback',
            user_id: currentSession.userId,
            default_channel_id: currentSession.channelIds[0] ?? null,
            notifications_enabled: false,
            view_preference: 'compact',
          },
          analysis: {
            most_used_reply_types: [],
            most_reused_suggestions: [],
            most_repeated_final_replies: [],
          },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const {
      ensureUserSettings,
      getAccessibleChannels,
      getReplyAnalysis,
      requireAppSessionFromRequest,
    } = await import('@/lib/runnitback-server')

    const session = await requireAppSessionFromRequest(request)
    const [channels, settings, analysis] = await Promise.all([
      getAccessibleChannels(session),
      ensureUserSettings(session),
      getReplyAnalysis(session),
    ])

    return NextResponse.json(
      { channels, settings, analysis },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const message = getErrorMessage(error)
    return NextResponse.json({ error: message }, { status: getStatusCode(message) })
  }
}
