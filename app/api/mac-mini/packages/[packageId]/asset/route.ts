export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { attachMacMiniLocalAsset } from '@/lib/mac-mini-handoff'
import { requireMacMiniWorkerRequest } from '@/lib/mac-mini-worker-auth'
import { supabaseAdmin } from '@/lib/supabase'

type RouteContext = {
  params: Promise<{ packageId: string }>
}

type AttachAssetBody = {
  localAssetPath?: string
  local_asset_path?: string
}

export async function POST(request: Request, context: RouteContext) {
  const worker = requireMacMiniWorkerRequest(request)
  if (!worker.ok) {
    return NextResponse.json({ ok: false, error: worker.error }, { status: worker.status })
  }

  const body = (await request.json().catch(() => ({}))) as AttachAssetBody
  const localAssetPath = (body.localAssetPath ?? body.local_asset_path ?? '').trim()
  if (!localAssetPath) {
    return NextResponse.json({ ok: false, error: 'localAssetPath is required.' }, { status: 400 })
  }

  const { packageId } = await context.params
  try {
    const pkg = await attachMacMiniLocalAsset(supabaseAdmin, packageId, localAssetPath)
    return NextResponse.json(
      {
        ok: true,
        data: pkg,
        safety: {
          publishAction: 'dry_run',
          callsMetricool: false,
          uploadsToTikTok: false,
          livePublishStateSet: false,
          clicksFinalPost: false,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Mac mini local asset could not be attached.',
        safety: {
          publishAction: 'dry_run',
          callsMetricool: false,
          uploadsToTikTok: false,
          livePublishStateSet: false,
          clicksFinalPost: false,
        },
      },
      { status: 422, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
