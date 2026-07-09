export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { recordMacMiniPackageDryRun, type MacMiniDryRunStatus } from '@/lib/mac-mini-handoff'
import { requireMacMiniWorkerRequest } from '@/lib/mac-mini-worker-auth'
import { supabaseAdmin } from '@/lib/supabase'

type RouteContext = {
  params: Promise<{ packageId: string }>
}

type DryRunBody = {
  status?: MacMiniDryRunStatus
  workerId?: string
  worker_id?: string
  result?: Record<string, unknown>
  error?: string
}

export async function POST(request: Request, context: RouteContext) {
  const worker = requireMacMiniWorkerRequest(request)
  if (!worker.ok) {
    return NextResponse.json({ ok: false, error: worker.error }, { status: worker.status })
  }

  const body = (await request.json().catch(() => ({}))) as DryRunBody
  const status = body.status
  if (status !== 'success' && status !== 'failure') {
    return NextResponse.json({ ok: false, error: 'Dry-run status must be success or failure.' }, { status: 400 })
  }

  const { packageId } = await context.params
  const pkg = await recordMacMiniPackageDryRun(supabaseAdmin, packageId, {
    status,
    workerId: body.workerId ?? body.worker_id ?? null,
    result: body.result ?? null,
    error: body.error ?? null,
  })

  return NextResponse.json(
    {
      ok: true,
      data: pkg,
      safety: {
        publishAction: 'dry_run',
        callsMetricool: false,
        uploadsToTikTok: false,
        livePublishStateSet: false,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
