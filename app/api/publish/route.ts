import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Deprecated: publish_jobs are not part of the Metricool-only pipeline.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Legacy publish jobs are disabled. Approved clips route to Metricool.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
