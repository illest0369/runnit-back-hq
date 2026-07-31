import { config } from 'dotenv'

import { getChannelMeta } from '../lib/channel-meta'
import { buildPublishExportPackage } from '../lib/export/build-export'
import { isDownloadableMp4Url } from '../lib/media-url'
import {
  getMetricoolBrandEnvName,
  getMetricoolConfigReport,
  isMetricoolTestMode,
} from '../lib/metricool'
import {
  getMetricoolWorkflowClips,
  getReadyPublishClips,
} from '../lib/moderation-queue'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('--') ? value.trim() : null
}

function readRequiredArg(name: string): string {
  const value = readArg(name)
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function scheduleDate(value?: string | null): string {
  const parsed = value ? new Date(value) : null
  const scheduled = parsed && Number.isFinite(parsed.getTime()) && parsed.getTime() > Date.now()
    ? parsed
    : new Date(Date.now() + 5 * 60 * 1000)

  return scheduled.toISOString().slice(0, 19)
}

function buildSchedulerPayload(input: {
  caption: string
  hashtags: string[]
  mediaId: string
  scheduledAt?: string | null
  title: string
}) {
  const text = [input.caption, input.hashtags.join(' ')].filter(Boolean).join('\n').trim()

  return {
    autoPublish: true,
    descendants: [],
    draft: false,
    firstCommentText: '',
    hasNotReadNotes: false,
    media: { mediaId: input.mediaId },
    mediaAltText: [],
    providers: [{ network: 'tiktok' }],
    publicationDate: {
      dateTime: scheduleDate(input.scheduledAt),
      timezone: process.env.METRICOOL_TIMEZONE?.trim() || 'America/Los_Angeles',
    },
    shortener: false,
    smartLinkData: { ids: [] },
    text,
    tiktokData: {
      autoAddMusic: false,
      commercialContentOwnBrand: false,
      commercialContentThirdParty: false,
      disableComment: false,
      disableDuet: false,
      disableStitch: false,
      photoCoverIndex: 0,
      privacyOption: 'PUBLIC_TO_EVERYONE',
      title: input.title,
    },
  }
}

function endpointPreview(input: {
  apiUrl: string
  blogId: string
  userId: string
}) {
  const url = new URL(`${input.apiUrl.replace(/\/+$/, '')}/v2/scheduler/posts`)
  url.searchParams.set('blogId', input.blogId)
  url.searchParams.set('userId', input.userId)
  url.searchParams.set('integrationSource', 'RBHQ')
  return url.toString()
}

function normalizeEndpointPreview(apiUrl: string, mediaUrl: string) {
  const url = new URL(`${apiUrl.replace(/\/+$/, '')}/actions/normalize/image/url`)
  url.searchParams.set('url', mediaUrl)
  return url.toString()
}

function mediaUrlStatus(value: string) {
  if (value.startsWith('/generated-clips/')) {
    return {
      kind: 'local_only',
      liveSchedulable: false,
      reason: 'Generated local-dev media uses a relative /generated-clips URL and is not reachable by Metricool unless the app publicly serves it.',
    }
  }
  if (value.startsWith('/')) {
    return {
      kind: 'local_relative',
      liveSchedulable: false,
      reason: 'Relative media URLs are local to this app and are not live-schedulable by Metricool as-is.',
    }
  }

  const parsed = new URL(value)
  return {
    kind: parsed.protocol === 'https:' || parsed.protocol === 'http:' ? 'absolute_url' : 'unsupported_url',
    liveSchedulable: parsed.protocol === 'https:' || parsed.protocol === 'http:',
    reason: parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? 'Absolute HTTP(S) MP4 URL. Reachability was not probed by this no-network dry-run script.'
      : 'Metricool requires an HTTP(S) reachable MP4 URL.',
  }
}

async function main() {
  if (!isMetricoolTestMode()) {
    throw new Error('Refusing to generate Metricool payload unless METRICOOL_TEST_MODE is true.')
  }

  const clipId = readRequiredArg('--clip-id')
  const scheduledAt = readArg('--scheduled-at')
  const readyClips = await getReadyPublishClips({ limit: 200 })
  const workflowClips = await getMetricoolWorkflowClips({ limit: 200 })
  const readyClip = readyClips.find((clip) => clip.id === clipId) ?? null
  const workflowClip = workflowClips.find((clip) => clip.id === clipId) ?? null
  const clip = workflowClip ?? readyClip

  if (!clip) {
    throw new Error(`Clip ${clipId} was not returned by ready publish or Metricool workflow queries.`)
  }
  if (!readyClip) {
    throw new Error(`Clip ${clipId} was not returned by getReadyPublishClips.`)
  }
  if (!workflowClip) {
    throw new Error(`Clip ${clipId} was not returned by getMetricoolWorkflowClips.`)
  }

  const exportPackage = buildPublishExportPackage(clip)
  if (!isDownloadableMp4Url(exportPackage.video_url)) {
    throw new Error(`Clip ${clipId} does not have a downloadable MP4 URL.`)
  }

  const channel = clip.channel_id ? getChannelMeta(clip.channel_id) : null
  const brandEnvName = getMetricoolBrandEnvName(clip.channel_id)
  const blogId = brandEnvName ? process.env[brandEnvName]?.trim() ?? '' : ''
  const userId = process.env.METRICOOL_USER_ID?.trim() ?? ''
  const apiUrl = process.env.METRICOOL_API_URL?.trim() ?? ''

  if (!brandEnvName || !blogId) {
    throw new Error(`Metricool brand env is missing for clip channel ${clip.channel_id ?? 'unknown'}.`)
  }
  if (!userId) {
    throw new Error('METRICOOL_USER_ID is required for dry-run payload generation.')
  }
  if (!apiUrl) {
    throw new Error('METRICOOL_API_URL is required for dry-run payload generation.')
  }

  const schedulerPayload = buildSchedulerPayload({
    caption: exportPackage.caption,
    hashtags: exportPackage.hashtags,
    mediaId: 'DRY_RUN_MEDIA_ID_NOT_REQUESTED',
    scheduledAt,
    title: exportPackage.title,
  })
  const mp4Status = mediaUrlStatus(exportPackage.video_url)

  console.log(JSON.stringify({
    result: 'PASS',
    dryRun: true,
    safety: {
      callsMetricool: false,
      recordsMetricoolHandoff: false,
      posts: false,
      schedules: false,
      uploadsToTikTok: false,
      uploadsToInstagram: false,
      uploadsToYouTube: false,
      requiresMetricoolTestMode: true,
    },
    metricoolEnvPresence: getMetricoolConfigReport().env,
    queryPresence: {
      getReadyPublishClips: true,
      getMetricoolWorkflowClips: true,
    },
    identifiers: {
      userId,
      blogId,
      brandEnvName,
      apiUrl,
    },
    clip: {
      id: clip.id,
      channelId: clip.channel_id,
      channelLabel: channel?.label ?? null,
      laneSlug: channel?.slug ?? null,
      publishStatus: clip.publish_status,
      reviewStatus: clip.status,
    },
    media: {
      mp4Url: exportPackage.video_url,
      renderedMp4Url: exportPackage.rendered_mp4_url,
      assetReference: exportPackage.asset_reference,
      status: mp4Status,
    },
    exportPackage: {
      title: exportPackage.title,
      description: exportPackage.description,
      caption: exportPackage.caption,
      hashtags: exportPackage.hashtags,
      targetPlatforms: exportPackage.target_platforms,
      platformCopy: exportPackage.platform_copy,
    },
    metricoolPreview: {
      normalizeEndpoint: normalizeEndpointPreview(apiUrl, exportPackage.video_url),
      schedulerEndpoint: endpointPreview({ apiUrl, blogId, userId }),
      schedulerPayload,
      note: 'media.mediaId is a placeholder because this dry-run does not call Metricool media normalization.',
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
