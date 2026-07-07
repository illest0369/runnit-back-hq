import type { ExportableClip, PublishExportPackage } from './types'
import { isDownloadableMp4Url } from '../media-url'
import { getStoredTikTokAnalysis } from '../tiktok-analyzer'

export const PUBLISH_EXPORT_VERSION = 'rbhq-publish-export-v1'

const GENERIC_SPORT_TAGS = ['#Sports', '#GameTime', '#ViralSports', '#Highlights']
const TAG_CLEANUP_PATTERN = /[^a-z0-9]/gi

function tagFromValue(value: string | null | undefined): string | null {
  const cleaned = value?.replace(TAG_CLEANUP_PATTERN, '').trim()
  return cleaned ? `#${cleaned}` : null
}

function uniqueHashtags(values: Array<string | null>): string[] {
  const seen = new Set<string>()
  const tags: string[] = []

  for (const value of values) {
    if (!value) continue
    const normalized = value.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    tags.push(value)
    if (tags.length === 6) break
  }

  return tags
}

export function buildHashtags(clip: ExportableClip): string[] {
  return uniqueHashtags([
    tagFromValue(clip.league),
    tagFromValue(clip.sport),
    tagFromValue(clip.source_name),
    ...GENERIC_SPORT_TAGS,
  ]).slice(0, 6)
}

function compactLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateLine(value: string, maxLength: number): string {
  const compacted = compactLine(value)
  if (compacted.length <= maxLength) return compacted

  return `${compacted.slice(0, maxLength - 3).trim()}...`
}

export function buildCaption(clip: ExportableClip, hashtags = buildHashtags(clip)): string {
  const lead = truncateLine(clip.recommended_hook || clip.hook || clip.title, 96)
  const context = compactLine([clip.league, clip.sport].filter(Boolean).join(' '))
  const tagLine = hashtags.slice(0, 6).join(' ')
  const firstLine = context ? `${lead} (${context})` : lead

  return [truncateLine(firstLine, 116), tagLine].filter(Boolean).join('\n')
}

export function assertExportableClip(clip: ExportableClip) {
  if (
    clip.status !== 'approved' ||
    !clip.video_url ||
    !isDownloadableMp4Url(clip.video_url) ||
    ![
      'metricool_ready_manual_export',
      'ready_for_manual_publish',
      'ready_for_automation',
      'sent_to_n8n',
      'automation_queued',
      'automation_failed',
      'manually_published',
      'metricool_published',
      'metricool_failed',
      'needs_clip_render',
    ].includes(clip.publish_status)
  ) {
    throw new Error('CLIP_NOT_READY_FOR_EXPORT')
  }
}

const EDITORIAL_CAPTION_PREFIX = 'editorial_caption:'
const EDITORIAL_HASHTAGS_PREFIX = 'editorial_hashtags:'

export function buildPublishExportPackage(clip: ExportableClip): PublishExportPackage {
  assertExportableClip(clip)

  const videoUrl = clip.video_url
  if (!videoUrl) {
    throw new Error('CLIP_NOT_READY_FOR_EXPORT')
  }

  const captionNote = clip.moderation_notes.find((n) => n.startsWith(EDITORIAL_CAPTION_PREFIX))
  const hashtagsNote = clip.moderation_notes.find((n) => n.startsWith(EDITORIAL_HASHTAGS_PREFIX))
  const analysis = getStoredTikTokAnalysis(clip.moderation_notes)

  const hashtags = hashtagsNote
    ? (JSON.parse(hashtagsNote.slice(EDITORIAL_HASHTAGS_PREFIX.length)) as string[])
    : analysis?.hashtagPack ?? buildHashtags(clip)
  const caption = captionNote
    ? (JSON.parse(captionNote.slice(EDITORIAL_CAPTION_PREFIX.length)) as string)
    : analysis?.captionDraft ?? buildCaption(clip, hashtags)

  return {
    clip_id: clip.id,
    title: clip.title,
    hook: clip.hook,
    recommended_hook: analysis?.hookLine ?? clip.recommended_hook,
    caption,
    hashtags,
    source_name: clip.source_name,
    sport: clip.sport,
    league: clip.league,
    video_url: videoUrl,
    thumbnail_url: clip.thumbnail_url,
    moderation_notes: clip.moderation_notes,
    approved_at: clip.approved_at || clip.updated_at,
    export_version: PUBLISH_EXPORT_VERSION,
  }
}
