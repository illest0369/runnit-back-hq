import { NextResponse } from 'next/server'

// Deprecated: Buffer is no longer a production publisher for RBHQ.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Buffer handoff is deprecated. Use the Metricool flow.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
