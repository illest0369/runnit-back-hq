export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

// Deprecated: RBHQ publish is Metricool-only. Use /api/metricool-export/[clipId]/mark-exported.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Manual publish is deprecated. Use the Metricool export flow.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
