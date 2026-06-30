export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'
import { deriveDashboardChannel, formatUserName, getDashboardChannelLabel } from '@/lib/channels'
import { getChannelMeta } from '@/lib/channel-meta'
import { isMetricoolTestMode } from '@/lib/metricool'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ ok: false, user: null }, { status: 401 })
    }

    const assignedChannels = session.channelIds
      .map((channelId) => getChannelMeta(channelId))
      .filter((channel): channel is NonNullable<typeof channel> => Boolean(channel))
    const primaryChannel = assignedChannels[0]

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
        channels: assignedChannels.map((assignedChannel) => {
          const assignedDashboardChannel = deriveDashboardChannel(assignedChannel) ?? 'sports'

          return {
            id: assignedChannel.id,
            channel: assignedDashboardChannel,
            label: getDashboardChannelLabel(assignedDashboardChannel),
            name: assignedChannel.name,
            handle: `@${assignedChannel.handle}`,
          }
        }),
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
