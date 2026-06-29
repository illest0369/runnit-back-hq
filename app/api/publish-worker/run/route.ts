import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Deprecated: no background publish worker is used in the Metricool-only flow.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Legacy publish worker disabled. Metricool is the only publisher.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
