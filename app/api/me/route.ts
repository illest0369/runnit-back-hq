export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'
import { deriveDashboardChannel, formatUserName, getDashboardChannelLabel } from '@/lib/channels'
import { getChannelMeta } from '@/lib/channel-meta'
import { isMetricoolTestMode } from '@/lib/metricool'

const FALLBACK_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000001'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ ok: false, user: null }, { status: 401 })
    }

    const primaryChannel =
      session.channelIds.map((channelId) => getChannelMeta(channelId)).find(Boolean) ??
      getChannelMeta(FALLBACK_CHANNEL_ID)

    if (!primaryChannel) {
      return NextResponse.json({ ok: false, user: null }, { status: 403 })
    }

    const channel = deriveDashboardChannel(primaryChannel) ?? 'sports'
    const name = formatUserName(session.username)

    return NextResponse.json({
      ok: true,
      user: {
        id: session.userId,
        name,
        channel,
        channelLabel: getDashboardChannelLabel(channel),
        channelDbId: primaryChannel.id,
        initials: name.slice(0, 2).toUpperCase(),
        handle: `@${primaryChannel.handle}`,
        metricoolTestMode: isMetricoolTestMode(),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load session.'
    return NextResponse.json(
      { ok: false, user: null, error: message },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
