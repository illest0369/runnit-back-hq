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
    .select('id, username, role')
    .single()

  if (updateError || !user) {
    return NextResponse.json({ ok: false, error: updateError?.message ?? 'Unable to set PIN' }, { status: 500 })
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

  return NextResponse.json({ ok: true })
}
