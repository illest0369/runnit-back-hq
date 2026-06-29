import { NextResponse } from 'next/server'

// Deprecated: Buffer/TikTok publish context is not used by the Metricool-only flow.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Legacy publish context disabled. Use /api/metricool-export.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
