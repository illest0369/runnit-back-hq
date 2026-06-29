import { NextResponse } from 'next/server'

// Deprecated: RBHQ publish is Metricool-only. This legacy Buffer/TikTok route is intentionally disabled.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Legacy publish route disabled. Use /api/metricool-export.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
