export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { getMacMiniClipPackageById } from '@/lib/mac-mini-handoff'
import { requireMacMiniWorkerRequest } from '@/lib/mac-mini-worker-auth'
import { supabaseAdmin } from '@/lib/supabase'

type RouteContext = {
  params: Promise<{ packageId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const worker = requireMacMiniWorkerRequest(request)
  if (!worker.ok) {
    return NextResponse.json({ ok: false, error: worker.error }, { status: worker.status })
  }

  const { packageId } = await context.params
  const pkg = await getMacMiniClipPackageById(supabaseAdmin, packageId)
  if (!pkg) {
    return NextResponse.json({ ok: false, error: 'Mac mini clip package not found.' }, { status: 404 })
  }

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
}
