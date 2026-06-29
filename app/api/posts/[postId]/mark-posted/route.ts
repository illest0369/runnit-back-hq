import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Deprecated: posted state must come from Metricool acceptance or Metricool export confirmation.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Manual post marking is deprecated. Use Metricool export confirmation.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
