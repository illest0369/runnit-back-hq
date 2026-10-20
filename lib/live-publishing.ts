export const RB_CFB_CHANNEL_ID = '93484eef-06d8-46fd-bce2-ce252422c58e'

function isRbCfbChannel(channel: string | null | undefined): boolean {
  const normalized = channel?.trim().toLowerCase()
  return normalized === 'rb_cfb' || normalized === RB_CFB_CHANNEL_ID
}

export function isRbCfbLivePublishingAllowed(channel: string | null | undefined): boolean {
  return !isRbCfbChannel(channel) || process.env.RBHQ_RB_CFB_LIVE_POSTING_ALLOWED === 'true'
}

export function assertRbCfbLivePublishingAllowed(channel: string | null | undefined): void {
  if (!isRbCfbLivePublishingAllowed(channel)) {
    throw new Error(
      'RB CFB live publishing is inactive. Separate authorization requires RBHQ_RB_CFB_LIVE_POSTING_ALLOWED=true.',
    )
  }
}
