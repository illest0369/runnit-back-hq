export type SocialPlatform = 'tiktok'

export type PostStatus =
  | 'ready'
  | 'queued'
  | 'publishing'
  | 'posted'
  | 'failed'

export type PublishDestination = 'tiktok_direct' | 'buffer' | 'manual'

export type PublishLogStep = 'route' | 'buffer_send' | 'complete' | 'error'

export type PublishMethod = 'webhook' | 'playwright' | 'device' | 'manual'

export type PublishJobStatus =
  | 'queued'
  | 'processing'
  | 'posted'
  | 'failed'
  | 'manual_required'

export type PublishJobInput = {
  clip_id: string
  channel: string
  platform?: string
  video_url: string
  caption?: string
  hashtags?: string[]
  publish_method?: PublishMethod
}

export type PublishJobRecord = {
  id: string
  clip_id: string
  channel: string
  platform: string
  status: PublishJobStatus
  video_url: string
  caption: string | null
  hashtags: string[] | null
  publish_method: PublishMethod
  attempts: number
  last_error: string | null
  external_post_id: string | null
  created_at: string
  updated_at: string
  posted_at: string | null
}

export type QueueJobPreview = {
  id: string
  clip_url?: string | null
  source_url?: string | null
  post_package?: {
    title?: string | null
    thumbnail?: string | null
    channelTitle?: string | null
    viewCount?: number | null
    velocity?: number | null
    url?: string | null
  } | null
}

export type SocialAccountRecord = {
  id: string
  channel_id: string
  platform: SocialPlatform
  account_name: string
  access_token: string | null
  refresh_token: string | null
  expires_at: string | null
  is_approved: boolean
  buffer_profile_id: string | null
  buffer_connected: boolean
  created_at?: string
  updated_at?: string
}

export type PublishPostRecord = {
  id: string
  clip_id: string
  status: PostStatus
  platform: SocialPlatform
  destination: PublishDestination
  caption: string
  video_url: string
  scheduled_time: string | null
  created_at: string
  updated_at?: string
}

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  ready: 'Ready',
  queued: 'Queued',
  publishing: 'Publishing',
  posted: 'Posted',
  failed: 'Failed',
}

export const DESTINATION_LABELS: Record<PublishDestination, string> = {
  buffer: 'Buffer',
  tiktok_direct: 'Direct (locked)',
  manual: 'Manual',
}

export function resolvePublishDestination(
  account?: Pick<SocialAccountRecord, 'is_approved' | 'buffer_connected'> | null,
): PublishDestination {
  if (account?.is_approved) {
    return 'tiktok_direct'
  }

  if (account?.buffer_connected) {
    return 'buffer'
  }

  return 'manual'
}

export function dedupeQueueJobs<T extends QueueJobPreview>(jobs: T[]): T[] {
  const seenIds = new Set<string>()
  const seenVideoKeys = new Set<string>()

  return jobs.filter((job) => {
    if (!job.id || seenIds.has(job.id)) {
      return false
    }

    const videoKey = buildPreviewVideoUrl(job)

    if (videoKey && seenVideoKeys.has(videoKey)) {
      return false
    }

    seenIds.add(job.id)

    if (videoKey) {
      seenVideoKeys.add(videoKey)
    }

    return true
  })
}

export function buildPreviewVideoUrl(job: QueueJobPreview): string {
  return (
    job.clip_url?.trim() ||
    job.post_package?.url?.trim() ||
    job.source_url?.trim() ||
    ''
  )
}

export function isDirectVideoAsset(url: string): boolean {
  return /\.(mp4|m4v|mov|webm)(\?.*)?$/i.test(url)
}

export function toDatetimeLocalValue(value?: string | null): string {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (input: number) => String(input).padStart(2, '0')

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
