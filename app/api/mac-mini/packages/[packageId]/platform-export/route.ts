export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import { getMacMiniClipPackageById } from '@/lib/mac-mini-handoff'
import { createPlatformReadyPackageFromMacMini } from '@/lib/platform-package-bridge'
import { supabaseAdmin } from '@/lib/supabase'

type RouteContext = {
  params: Promise<{ packageId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (session.role !== 'admin' && session.channelIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  if (!validateCsrfRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid CSRF token.' }, { status: 403 })
  }

  const { packageId } = await context.params
  const pkg = await getMacMiniClipPackageById(supabaseAdmin, packageId)
  if (!pkg) {
    return NextResponse.json({ ok: false, error: 'Mac mini package not found.' }, { status: 404 })
  }
  if (session.channelIds.length > 0 && !session.channelIds.includes(pkg.targetChannelId)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await createPlatformReadyPackageFromMacMini(supabaseAdmin, packageId)
    return NextResponse.json(
      {
        ok: true,
        data: {
          ...result,
          safety: {
            ...result.safety,
            callsMetricool: false,
            livePublish: false,
          },
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Platform package could not be created.' },
      { status: 409 },
    )
  }
}
