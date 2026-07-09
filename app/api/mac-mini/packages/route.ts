export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import {
  createMacMiniClipPackageFromCandidate,
  getPendingMacMiniClipPackages,
} from '@/lib/mac-mini-handoff'
import { requireMacMiniWorkerRequest } from '@/lib/mac-mini-worker-auth'
import { supabaseAdmin } from '@/lib/supabase'

type CreatePackageBody = {
  candidateId?: string
  candidate_id?: string
}

function readLimit(request: Request): number {
  const url = new URL(request.url)
  const parsed = Number(url.searchParams.get('limit') ?? '')
  if (!Number.isFinite(parsed) || parsed <= 0) return 10
  return Math.min(50, Math.trunc(parsed))
}

export async function GET(request: Request) {
  const worker = requireMacMiniWorkerRequest(request)
  if (!worker.ok) {
    return NextResponse.json({ ok: false, error: worker.error }, { status: worker.status })
  }

  const packages = await getPendingMacMiniClipPackages(supabaseAdmin, { limit: readLimit(request) })
  return NextResponse.json(
    {
      ok: true,
      data: packages,
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

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }
  if (!validateCsrfRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid CSRF token.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as CreatePackageBody
  const candidateId = (body.candidateId ?? body.candidate_id ?? '').trim()
  if (!candidateId) {
    return NextResponse.json({ ok: false, error: 'candidateId is required.' }, { status: 400 })
  }

  const pkg = await createMacMiniClipPackageFromCandidate(supabaseAdmin, candidateId)
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
