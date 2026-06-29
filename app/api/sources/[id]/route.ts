import { NextResponse } from 'next/server'
import { z } from 'zod'

import { supabaseAdmin } from '@/lib/supabase'
import { requireAppSession } from '@/lib/runnitback-server'

export const dynamic = 'force-dynamic'

const SOURCE_SELECT =
  'id, channel_id, url, channel_name, channel_url, platform, category, active, priority, priority_weight, ingest_limit, last_run_at, last_ingested_at, videos_enqueued, success_rate, created_at'
const SOURCE_FALLBACK_SELECT = 'id, channel_id, url, platform, category, active, created_at'

const SourceSchema = z.object({
  url: z.string().url(),
  platform: z.enum(['youtube', 'tiktok', 'instagram', 'reddit', 'direct']).default('youtube'),
  category: z.string().trim().min(1).nullable().optional(),
  channel_name: z.string().trim().min(1).nullable().optional(),
  ingest_limit: z.number().int().min(1).max(50).optional(),
})

type RouteContext = {
  params: Promise<{ id: string }>
}

async function getRouteId(context: RouteContext) {
  const { id } = await context.params
  return id
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireAppSession()
    const channelId = await getRouteId(context)

    if (!session.channelIds.includes(channelId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sourceQuery = await supabaseAdmin
      .from('sources')
      .select(SOURCE_SELECT)
      .eq('channel_id', channelId)
      .eq('active', true)
      .order('created_at', { ascending: false })
    let data: unknown = sourceQuery.data
    let error = sourceQuery.error

    if (error?.message.includes('does not exist')) {
      const fallback = await supabaseAdmin
        .from('sources')
        .select(SOURCE_FALLBACK_SELECT)
        .eq('channel_id', channelId)
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

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireAppSession()
    const channelId = await getRouteId(context)

    if (!session.channelIds.includes(channelId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = SourceSchema.parse(await request.json())
    const insertQuery = await supabaseAdmin
      .from('sources')
      .insert({
        channel_id: channelId,
        url: body.url,
        channel_url: body.url,
        channel_name: body.channel_name ?? null,
        platform: body.platform,
        category: body.category ?? null,
        ingest_limit: body.ingest_limit ?? 8,
        active: true,
      })
      .select(SOURCE_SELECT)
      .single()
    let data: unknown = insertQuery.data
    let error = insertQuery.error

    if (error?.message.includes('does not exist')) {
      const fallback = await supabaseAdmin
        .from('sources')
        .insert({
          channel_id: channelId,
          url: body.url,
          platform: body.platform,
          category: body.category ?? null,
          active: true,
        })
        .select(SOURCE_FALLBACK_SELECT)
        .single()
      data = fallback.data
      error = fallback.error
    }

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({ source: data }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Invalid source payload.' },
        { status: 400 },
      )
    }

    const message = error instanceof Error ? error.message : 'Unexpected source create error.'
    const status = message === 'Unauthorized' ? 401 : 500

    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await requireAppSession()
    const sourceId = await getRouteId(context)

    const { data: source, error: sourceError } = await supabaseAdmin
      .from('sources')
      .select('id, channel_id')
      .eq('id', sourceId)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: 'Source not found.' }, { status: 404 })
    }

    if (!session.channelIds.includes(source.channel_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('sources')
      .update({ active: false })
      .eq('id', sourceId)

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected source delete error.'
    const status = message === 'Unauthorized' ? 401 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
