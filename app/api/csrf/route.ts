export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { applyCsrfCookie, generateCsrfToken } from '@/lib/csrf'

export async function GET() {
  const csrfToken = generateCsrfToken()
  const response = NextResponse.json(
    { csrfToken },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )

  applyCsrfCookie(response, csrfToken)

  return response
}
