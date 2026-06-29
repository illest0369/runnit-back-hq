import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'
import { getUserTestReport } from '@/lib/clip-db'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? 10) || 10))

  return NextResponse.json(
    { ok: true, data: getUserTestReport(limit) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
