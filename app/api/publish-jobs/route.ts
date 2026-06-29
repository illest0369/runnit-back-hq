import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Deprecated: publish_jobs are ignored by the Metricool-only pipeline.
export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'Legacy publish_jobs are disabled. Use /api/metricool-export.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
