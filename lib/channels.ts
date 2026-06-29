export type DashboardChannel = 'sports' | 'arena' | 'women' | 'combat' | 'runnitbackcfb'

type ChannelRecord = {
  category?: string | null
  niche?: string | null
  handle?: string | null
  name?: string | null
}

const LABELS: Record<DashboardChannel, string> = {
  sports: 'RB Sports',
  arena: 'RB Arena',
  women: 'RB Women',
  combat: 'RB Combat',
  runnitbackcfb: 'RB CFB',
}

export function normalizeDashboardChannel(value: string | null | undefined): DashboardChannel | null {
  const normalized = value?.trim().toLowerCase()

  switch (normalized) {
    case 'sports':
    case 'nba':
    case 'basketball':
    case 'nfl':
    case 'football':
    case 'mlb':
    case 'baseball':
    case 'soccer':
      return 'sports'
    case 'arena':
    case 'gaming':
    case 'esports':
      return 'arena'
    case 'women':
    case 'womens_sports':
    case 'women_sports':
      return 'women'
    case 'combat':
      return 'combat'
    case 'runnitbackcfb':
    case 'cfb':
    case 'college_football':
    case 'college-football':
      return 'runnitbackcfb'
    default:
      return null
  }
}

export function deriveDashboardChannel(record: ChannelRecord): DashboardChannel | null {
  return (
    normalizeDashboardChannel(record.category) ??
    normalizeDashboardChannel(record.niche) ??
    normalizeDashboardChannel(record.handle?.replace(/^runnitback/, '')) ??
    normalizeDashboardChannel(record.name?.replace(/^runnit back\s+/i, '')) ??
    null
  )
}

export function getDashboardChannelLabel(channel: DashboardChannel): string {
  return LABELS[channel]
}

export function formatUserName(username: string | null | undefined): string {
  const value = username?.trim()
  if (!value) {
    return 'Operator'
  }

  return value.charAt(0).toUpperCase() + value.slice(1)
}
