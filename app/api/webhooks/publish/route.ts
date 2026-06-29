import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Deprecated: generic publish webhooks are not part of the Metricool-only pipeline.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Legacy publish webhook disabled. Approved clips route to Metricool.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
