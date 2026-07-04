export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { getN8nConfigReport } from '@/lib/n8n-publisher'

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(
    {
      ok: true,
      data: getN8nConfigReport(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
