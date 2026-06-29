import { NextResponse } from 'next/server'

import { requireAppSession } from '@/lib/runnitback-server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await requireAppSession()
    if (session.channelIds.length === 0) {
      return NextResponse.json({ ready: 0, approved: 0, posting: 0, failed: 0 })
    }

    const { data, error } = await supabaseAdmin
      .from('posts')
      .select('status')
      .in('channel_id', session.channelIds)

    if (error) {
      throw new Error(error.message)
    }

    const statuses = (data ?? []).map((row: { status: string | null }) => row.status)
    return NextResponse.json({
      ready: statuses.filter((status) => status === 'AI_DECISION' || status === 'READY_FOR_CLIP_APPROVAL').length,
      approved: statuses.filter((status) => status === 'APPROVED_BY_HUMAN' || status === 'POST_APPROVED').length,
      posting: statuses.filter((status) => status === 'POSTING' || status === 'sent_to_publish').length,
      failed: statuses.filter((status) => status === 'FAILED' || status === 'failed').length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load queue stats.'
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 })
  }
}
