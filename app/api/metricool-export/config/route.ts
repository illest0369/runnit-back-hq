export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import {
  getMetricoolConfigReport,
  validateMetricoolConnectivity,
} from '@/lib/metricool'

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const includeConnectivity = url.searchParams.get('connectivity') === '1'
  const report = getMetricoolConfigReport()
  const connectivity = includeConnectivity
    ? await validateMetricoolConnectivity()
    : null

  return NextResponse.json(
    {
      ok: true,
      data: {
        ...report,
        connectivity,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
