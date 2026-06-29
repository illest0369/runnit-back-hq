import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/supabase'
import { requireAppSession } from '@/lib/runnitback-server'

export const dynamic = 'force-dynamic'

const SOURCE_SELECT =
  'id, channel_id, url, channel_name, channel_url, platform, category, active, priority, priority_weight, ingest_limit, last_run_at, last_ingested_at, videos_enqueued, success_rate, created_at'
const SOURCE_FALLBACK_SELECT = 'id, channel_id, url, platform, category, active, created_at'

export async function GET() {
  try {
    const session = await requireAppSession()

    if (session.channelIds.length === 0) {
      return NextResponse.json(
        { sources: [] },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const sourceQuery = await supabaseAdmin
      .from('sources')
      .select(SOURCE_SELECT)
      .in('channel_id', session.channelIds)
      .eq('active', true)
      .order('created_at', { ascending: false })
    let data: unknown = sourceQuery.data
    let error = sourceQuery.error

    if (error?.message.includes('does not exist')) {
      const fallback = await supabaseAdmin
        .from('sources')
        .select(SOURCE_FALLBACK_SELECT)
        .in('channel_id', session.channelIds)
        .eq('active', true)
        .order('created_at', { ascending: false })
      data = fallback.data
      error = fallback.error
    }

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json(
      { sources: data ?? [] },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected sources error.'
    const status = message === 'Unauthorized' ? 401 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
