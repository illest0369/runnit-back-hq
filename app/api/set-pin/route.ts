// LEGACY — not used in active ingest pipeline
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { validateCsrfRequest } from '@/lib/csrf'
import { isValidPinFormat } from '@/lib/deployment-pin'
import { consumeAuthRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }
  if (!validateCsrfRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid CSRF token.' }, { status: 403 })
  }

  const { supabaseAdmin } = await import('@/lib/supabase')
  const bcrypt = await import('bcryptjs')
  const body = await request.json().catch(() => ({}))
  const { user_id, pin } = body as { user_id?: string; pin?: string }

  const rateLimit = await consumeAuthRateLimit(request, 'set-pin')
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many attempts. Try again in a minute.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.resetSeconds || 60),
        },
      },
    )
  }

  if (!user_id || !pin || !isValidPinFormat(pin)) {
    return NextResponse.json({ ok: false, error: 'user_id and 6-digit PIN required' }, { status: 400 })
  }

  const hash = await bcrypt.hash(pin, 10)

  const { data: user, error: updateError } = await supabaseAdmin
    .from('users')
    .update({ pin_hash: hash })
    .eq('id', user_id)
    .select('id')
    .single()

  if (updateError || !user) {
    return NextResponse.json({ ok: false, error: updateError?.message ?? 'Unable to set PIN' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
