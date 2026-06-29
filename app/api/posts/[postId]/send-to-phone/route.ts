import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Deprecated: mobile relay publish is outside the Metricool-only RBHQ flow.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Mobile relay publishing is deprecated. Use Metricool export.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
