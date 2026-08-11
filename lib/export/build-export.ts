import type { ExportableClip, PublishExportPackage } from './types'
import { isDownloadableMp4Url } from '../media-url'
import { readPlatformPackageFromNotes } from '../platform-package-bridge'
import { getStoredTikTokAnalysis } from '../tiktok-analyzer'

export const PUBLISH_EXPORT_VERSION = 'rbhq-publish-export-v1'

const GENERIC_SPORT_TAGS = ['#Sports', '#GameTime', '#ViralSports', '#Highlights']
const TAG_CLEANUP_PATTERN = /[^a-z0-9]/gi
const RB_WOMEN_CHANNEL_ID = 'a1000000-0000-0000-0000-000000000004'
const RB_WOMEN_EXPORT_TAGS = ['#RunnitBackWomen', '#WomensBasketball', '#WNBA', '#BasketballHighlights', '#WomensSports']

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

function normalizeRbWomenExportHashtags(hashtags: string[]): string[] {
  return uniqueHashtags([...hashtags, ...RB_WOMEN_EXPORT_TAGS]).slice(0, 5)
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
  const platformPackage = readPlatformPackageFromNotes(clip.moderation_notes)

  const rawHashtags = hashtagsNote
    ? (JSON.parse(hashtagsNote.slice(EDITORIAL_HASHTAGS_PREFIX.length)) as string[])
    : platformPackage?.clip.hashtags ?? analysis?.hashtagPack ?? buildHashtags(clip)
  const hashtags = (clip.channel_id ?? platformPackage?.channel.id) === RB_WOMEN_CHANNEL_ID
    ? normalizeRbWomenExportHashtags(rawHashtags)
    : rawHashtags
  const caption = captionNote
    ? (JSON.parse(captionNote.slice(EDITORIAL_CAPTION_PREFIX.length)) as string)
    : platformPackage?.clip.caption ?? analysis?.captionDraft ?? buildCaption(clip, hashtags)

  return {
    clip_id: clip.id,
    channel_id: clip.channel_id ?? platformPackage?.channel.id ?? null,
    title: clip.title,
    hook: clip.hook,
    recommended_hook: analysis?.hookLine ?? clip.recommended_hook,
    caption,
    description: platformPackage?.clip.description ?? null,
    hashtags,
    source_name: clip.source_name,
    source_url: clip.source_url ?? platformPackage?.source.url ?? null,
    source_title: platformPackage?.source.title ?? null,
    sport: clip.sport,
    league: clip.league,
    video_url: videoUrl,
    rendered_mp4_url: platformPackage?.asset.publicUrl ?? videoUrl,
    asset_reference: platformPackage?.asset.stableReference ?? null,
    thumbnail_url: clip.thumbnail_url,
    selected_clip: {
      start_seconds: platformPackage?.clip.selectedStartSeconds ?? null,
      end_seconds: platformPackage?.clip.selectedEndSeconds ?? null,
    },
    target_platforms: platformPackage?.targetPlatforms ?? ['tiktok', 'instagram_reels', 'youtube_shorts'],
    platform_copy: platformPackage
      ? {
          tiktok: {
            title: platformPackage.copy.tiktok.title,
            caption: platformPackage.copy.tiktok.caption,
            description: platformPackage.copy.tiktok.description,
            hashtags,
            video_url: platformPackage.copy.tiktok.videoUrl,
          },
          instagram_reels: {
            title: platformPackage.copy.instagram_reels.title,
            caption: platformPackage.copy.instagram_reels.caption,
            description: platformPackage.copy.instagram_reels.description,
            hashtags,
            video_url: platformPackage.copy.instagram_reels.videoUrl,
          },
          youtube_shorts: {
            title: platformPackage.copy.youtube_shorts.title,
            caption: platformPackage.copy.youtube_shorts.caption,
            description: platformPackage.copy.youtube_shorts.description,
            hashtags,
            video_url: platformPackage.copy.youtube_shorts.videoUrl,
          },
        }
      : undefined,
    operator_notes: platformPackage?.operatorNotes,
    moderation_notes: clip.moderation_notes,
    approved_at: clip.approved_at || clip.updated_at,
    export_version: PUBLISH_EXPORT_VERSION,
  }
}
