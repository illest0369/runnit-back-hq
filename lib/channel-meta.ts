import type { AppChannel } from './runnitback'
import type { DashboardChannel } from './channels'

export type ChannelMetaRecord = {
  id: string
  slug: DashboardChannel
  label: string
  name: string
  niche: string
  handle: string
}

export const CHANNEL_META: Record<string, ChannelMetaRecord> = {
  'a1000000-0000-0000-0000-000000000001': {
    id: 'a1000000-0000-0000-0000-000000000001',
    slug: 'sports',
    label: 'RB Sports',
    name: 'RB Sports',
    niche: 'sports',
    handle: 'runnitbacksports',
  },
  'a1000000-0000-0000-0000-000000000002': {
    id: 'a1000000-0000-0000-0000-000000000002',
    slug: 'arena',
    label: 'RB Arena',
    name: 'RB Arena',
    niche: 'arena',
    handle: 'runnitbackarena',
  },
  'a1000000-0000-0000-0000-000000000003': {
    id: 'a1000000-0000-0000-0000-000000000003',
    slug: 'combat',
    label: 'RB Combat',
    name: 'RB Combat',
    niche: 'combat',
    handle: 'runnitbackcombat',
  },
  'a1000000-0000-0000-0000-000000000004': {
    id: 'a1000000-0000-0000-0000-000000000004',
    slug: 'women',
    label: 'RB Women',
    name: 'RB Women',
    niche: 'women',
    handle: 'runnitbackwomen',
  },
  '93484eef-06d8-46fd-bce2-ce252422c58e': {
    id: '93484eef-06d8-46fd-bce2-ce252422c58e',
    slug: 'runnitbackcfb',
    label: 'RB CFB',
    name: 'RB CFB',
    niche: 'college_football',
    handle: 'runnitbackcfb',
  },
}

export function getChannelMeta(channelId: string): ChannelMetaRecord | null {
  return CHANNEL_META[channelId] ?? null
}

export function listChannelMeta(channelIds?: string[]): ChannelMetaRecord[] {
  const entries = Object.values(CHANNEL_META)

  if (!channelIds || channelIds.length === 0) {
    return entries
  }

  const allowed = new Set(channelIds)
  return entries.filter((entry) => allowed.has(entry.id))
}

export function toAppChannel(channelId: string): AppChannel | null {
  const channel = getChannelMeta(channelId)
  if (!channel) {
    return null
  }

  return {
    id: channel.id,
    name: channel.name,
    niche: channel.niche,
    tiktok_profile_url: null,
    buffer_profile_id: null,
    status: 'active',
  }
}
