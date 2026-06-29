import type { PublishExportPackage } from './export/types'

export const READY_FOR_EXPORT_STATE = 'METRICOOL_READY'

export type MetricoolExportItem = {
  id: string
  title: string
  hook: string
  caption: string
  hashtags: string[]
  sourceUrl: string | null
  channel: string
  channelId: string | null
  sourceName: string
  createdAt: string
  approvedAt: string | null
  videoUrl: string
  thumbnailUrl: string | null
  exportDownloadUrl: string
  mediaDownloadUrl: string | null
  exportState: typeof READY_FOR_EXPORT_STATE
  reviewStatus?: string
  publishStatus?: string
  manuallyPublishedAt?: string | null
  updatedAt?: string
  exportPackage: PublishExportPackage
}

export function formatMetricoolHashtags(hashtags: string[]): string {
  return hashtags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .join(' ')
}
