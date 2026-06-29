import { NextResponse } from 'next/server'

// Deprecated: social account routing was for Buffer/TikTok direct publishing.
// RBHQ production publishing is Metricool-only.
export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'Legacy social account routing is disabled. Channels are managed in Metricool.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Buffer connection is deprecated. Channels are managed in Metricool.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
