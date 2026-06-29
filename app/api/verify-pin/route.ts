// LEGACY — not used in active ingest pipeline
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { createSession } from '@/lib/auth'
import { isValidPinFormat } from '@/lib/deployment-pin'
import { consumeAuthRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const { supabaseAdmin } = await import('@/lib/supabase')
  const bcrypt = await import('bcryptjs')
  const body = await request.json().catch(() => ({}))
  const { user_id, pin } = body as { user_id?: string; pin?: string }

  const rateLimit = await consumeAuthRateLimit(request, 'verify-pin')
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

  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, username, pin_hash, role')
    .eq('id', user_id)
    .maybeSingle()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 })
  }

  if (!user.pin_hash) {
    return NextResponse.json({ ok: false, error: 'NO_PIN_SET' }, { status: 403 })
  }

  const match = await bcrypt.compare(pin, user.pin_hash)
  if (!match) {
    return NextResponse.json({ ok: false, error: 'Incorrect PIN' }, { status: 401 })
  }

  const accessQuery = await supabaseAdmin
    .from('user_channel_access')
    .select('channel_id')
    .eq('user_id', user.id)

  const fallbackQuery = accessQuery.error
    ? await supabaseAdmin
        .from('user_channels')
        .select('channel_id')
        .eq('user_id', user.id)
    : null

  const channelIds = (
    accessQuery.error ? fallbackQuery?.data ?? [] : accessQuery.data ?? []
  ).map((record: { channel_id: string }) => record.channel_id)

  await createSession({
    userId: user.id,
    username: user.username,
    role: user.role === 'admin' ? 'admin' : 'operator',
    channelIds,
  })

  return NextResponse.json({ ok: true, user_id: user.id })
}
