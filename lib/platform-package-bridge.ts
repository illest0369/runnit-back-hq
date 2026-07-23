import type { SupabaseClient } from '@supabase/supabase-js'

import { getMacMiniClipPackageById, type MacMiniClipPackage } from './mac-mini-handoff'
import { storePlatformMp4Asset, type StoredPlatformMediaAsset } from './media-storage'

type PlatformBridgeDb = Pick<SupabaseClient, 'from'>

type CandidateRow = {
  id: string
  ingested_video_id: string
  target_channel_id: string | null
  start_seconds: number | string | null
  end_seconds: number | string | null
  suggested_clip_start_seconds: number | string | null
  suggested_clip_end_seconds: number | string | null
  title: string | null
  summary: string | null
  hook_text: string | null
  caption: string | null
  hashtags: string[] | null
  score: number | string | null
  score_breakdown: Record<string, unknown> | null
  status: string | null
  ingested_videos: JoinedVideo | JoinedVideo[] | null
}

type JoinedVideo = {
  id: string
  source_channel_id: string | null
  external_video_id: string | null
  platform: string | null
  title: string | null
  description: string | null
  video_url: string | null
  thumbnail_url: string | null
  duration_seconds: number | string | null
  source_channels: JoinedSource | JoinedSource[] | null
}

type JoinedSource = {
  id: string
  channel_key: string | null
  display_name: string | null
  target_rbhq_channel_id: string | null
}

type ClipRow = {
  id: string
  moderation_notes: string[] | null
  risk_flags: string[] | null
}

export type PlatformTarget = 'tiktok' | 'instagram_reels' | 'youtube_shorts'

export type PlatformExportCopy = {
  platform: PlatformTarget
  title: string
  caption: string
  description: string
  hashtags: string[]
  videoUrl: string
}

export type PlatformReadyPackage = {
  version: 'rbhq-platform-export-v1'
  packageId: string
  candidateId: string
  clipId: string
  channel: {
    id: string
    label: string
    slug: string
  }
  source: {
    url: string
    title: string
    name: string
    platform: string | null
  }
  clip: {
    title: string
    caption: string
    description: string
    hashtags: string[]
    selectedStartSeconds: number | null
    selectedEndSeconds: number | null
    durationSeconds: number
  }
  asset: {
    localAssetPath: string
    publicUrl: string
    stableReference: string
    storageMode: 'r2' | 'local_dev'
  }
  targetPlatforms: PlatformTarget[]
  copy: Record<PlatformTarget, PlatformExportCopy>
  operatorNotes: string[]
  safety: {
    callsMetricool: false
    uploadsToTikTok: false
    uploadsToInstagram: false
    uploadsToYouTube: false
    livePublish: false
  }
  createdAt: string
}

export type PackageToPlatformResult = {
  clipId: string
  packageId: string
  candidateId: string
  publishStatus: 'ready_for_manual_publish'
  publicUrl: string
  storageMode: 'r2' | 'local_dev'
  storageReference: string
  platformPackage: PlatformReadyPackage
  safety: PlatformReadyPackage['safety']
}

const PLATFORM_PACKAGE_NOTE_PREFIX = 'platform_package:'
const EDITORIAL_CAPTION_PREFIX = 'editorial_caption:'
const EDITORIAL_HASHTAGS_PREFIX = 'editorial_hashtags:'

function compact(value: string | null | undefined, maxLength = 500): string {
  const clean = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 3).trim()}...`
}

function readNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function readStringArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.map((item) => compact(item, 80)).filter(Boolean) : []
}

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function uniqueNotes(notes: string[]): string[] {
  const seen = new Set<string>()
  return notes.filter((note) => {
    if (!note || seen.has(note)) return false
    seen.add(note)
    return true
  })
}

function safeJsonNote(prefix: string, value: unknown): string {
  return `${prefix}${JSON.stringify(value)}`
}

function buildPlatformCopy(input: {
  title: string
  caption: string
  description: string
  hashtags: string[]
  videoUrl: string
}): Record<PlatformTarget, PlatformExportCopy> {
  const targets: PlatformTarget[] = ['tiktok', 'instagram_reels', 'youtube_shorts']
  return targets.reduce((copy, platform) => {
    copy[platform] = {
      platform,
      title: input.title,
      caption: input.caption,
      description: input.description,
      hashtags: input.hashtags,
      videoUrl: input.videoUrl,
    }
    return copy
  }, {} as Record<PlatformTarget, PlatformExportCopy>)
}

function buildPlatformReadyPackage(input: {
  pkg: MacMiniClipPackage
  candidate: CandidateRow
  video: JoinedVideo
  source: JoinedSource | null
  asset: StoredPlatformMediaAsset
  clipId: string
  now: string
}): PlatformReadyPackage {
  const title = compact(input.pkg.payload.tiktokDraft?.title || input.candidate.title || input.pkg.sourceTitle, 120)
  const caption = compact(input.pkg.caption || input.candidate.caption || title, 2200)
  const hashtags = readStringArray(input.pkg.hashtags).length > 0
    ? readStringArray(input.pkg.hashtags)
    : readStringArray(input.candidate.hashtags)
  const description = compact(input.candidate.summary || input.video.description || input.pkg.operatorSummary || caption, 2200)
  const selectedStartSeconds = readNumber(input.candidate.start_seconds ?? input.candidate.suggested_clip_start_seconds)
  const selectedEndSeconds = readNumber(input.candidate.end_seconds ?? input.candidate.suggested_clip_end_seconds)
  const targetPlatforms: PlatformTarget[] = ['tiktok', 'instagram_reels', 'youtube_shorts']
  const copy = buildPlatformCopy({
    title,
    caption,
    description,
    hashtags,
    videoUrl: input.asset.publicUrl,
  })

  return {
    version: 'rbhq-platform-export-v1',
    packageId: input.pkg.id,
    candidateId: input.pkg.clipCandidateId,
    clipId: input.clipId,
    channel: {
      id: input.pkg.targetChannelId,
      label: input.pkg.laneLabel,
      slug: input.pkg.laneSlug,
    },
    source: {
      url: input.pkg.sourceUrl,
      title: input.pkg.sourceTitle,
      name: input.pkg.sourceName || input.source?.display_name || 'RBHQ Source',
      platform: input.video.platform,
    },
    clip: {
      title,
      caption,
      description,
      hashtags,
      selectedStartSeconds,
      selectedEndSeconds,
      durationSeconds: input.asset.durationSeconds,
    },
    asset: {
      localAssetPath: input.asset.sourceLocalPath,
      publicUrl: input.asset.publicUrl,
      stableReference: input.asset.objectKey,
      storageMode: input.asset.storageMode,
    },
    targetPlatforms,
    copy,
    operatorNotes: [
      input.pkg.operatorSummary,
      input.pkg.whyNow,
      ...input.pkg.editNotes,
      input.asset.storageMode === 'local_dev'
        ? 'Local-dev storage only: public URL is served by this Next.js app, not durable cloud storage.'
        : 'Production media storage: R2 public object is ready for platform upload/export.',
      'Manual/semi-automated export only: this bridge does not post to TikTok, Instagram, YouTube, Metricool, or n8n.',
    ].map((note) => compact(note, 500)).filter(Boolean),
    safety: {
      callsMetricool: false,
      uploadsToTikTok: false,
      uploadsToInstagram: false,
      uploadsToYouTube: false,
      livePublish: false,
    },
    createdAt: input.now,
  }
}

function hasApprovedCandidateStatus(status: string | null): boolean {
  return ['approved', 'approved_for_review', 'approved_for_handoff', 'promoted'].includes(status ?? '')
}

async function loadCandidate(supabase: PlatformBridgeDb, candidateId: string): Promise<CandidateRow> {
  const { data, error } = await supabase
    .from('clip_candidates')
    .select(
      `id, ingested_video_id, target_channel_id, start_seconds, end_seconds, suggested_clip_start_seconds, suggested_clip_end_seconds,
       title, summary, hook_text, caption, hashtags, score, score_breakdown, status,
       ingested_videos!inner (
         id, source_channel_id, external_video_id, platform, title, description, video_url, thumbnail_url, duration_seconds,
         source_channels ( id, channel_key, display_name, target_rbhq_channel_id )
       )`,
    )
    .eq('id', candidateId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Clip candidate not found.')
  }
  return data as unknown as CandidateRow
}

async function loadExistingClip(supabase: PlatformBridgeDb, pkg: MacMiniClipPackage, candidate: CandidateRow): Promise<ClipRow | null> {
  const promotedClipId = typeof candidate.score_breakdown?.promotedClipId === 'string'
    ? candidate.score_breakdown.promotedClipId
    : null
  if (promotedClipId) {
    const { data, error } = await supabase
      .from('clips')
      .select('id, moderation_notes, risk_flags')
      .eq('id', promotedClipId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return data as ClipRow
  }

  const { data, error } = await supabase
    .from('clips')
    .select('id, moderation_notes, risk_flags')
    .eq('external_id', `platform_package:${pkg.id}`)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as ClipRow | null
}

function clipPayload(input: {
  pkg: MacMiniClipPackage
  candidate: CandidateRow
  video: JoinedVideo
  source: JoinedSource | null
  asset: StoredPlatformMediaAsset
  platformPackage: PlatformReadyPackage
  existing: ClipRow | null
  now: string
}) {
  const score = Math.max(0, Math.min(100, Math.round(readNumber(input.pkg.score) ?? readNumber(input.candidate.score) ?? 70)))
  const startSeconds = input.platformPackage.clip.selectedStartSeconds
  const endSeconds = input.platformPackage.clip.selectedEndSeconds
  const durationSeconds = endSeconds !== null && startSeconds !== null && endSeconds > startSeconds
    ? Math.round(endSeconds - startSeconds)
    : Math.max(1, Math.round(input.asset.durationSeconds))
  const existingNotes = input.existing?.moderation_notes ?? []
  const existingRiskFlags = input.existing?.risk_flags ?? []
  const notes = uniqueNotes([
    ...existingNotes.filter((note) => !note.startsWith(PLATFORM_PACKAGE_NOTE_PREFIX)),
    `clip_candidate:${input.pkg.clipCandidateId}`,
    `mac_mini_package:${input.pkg.id}`,
    `platform_asset:${input.asset.objectKey}`,
    `platform_asset_url:${input.asset.publicUrl}`,
    `platform_asset_storage:${input.asset.storageMode}`,
    safeJsonNote(EDITORIAL_CAPTION_PREFIX, input.platformPackage.clip.caption),
    safeJsonNote(EDITORIAL_HASHTAGS_PREFIX, input.platformPackage.clip.hashtags),
    safeJsonNote(PLATFORM_PACKAGE_NOTE_PREFIX, input.platformPackage),
  ])
  const riskFlags = uniqueNotes([
    ...existingRiskFlags.filter((flag) => flag !== 'needs_clip_render'),
    'asset_ready',
    'platform_ready',
    input.asset.storageMode === 'local_dev' ? 'local_dev_media_storage' : 'durable_media_storage',
  ])

  return {
    channel_id: input.pkg.targetChannelId,
    external_id: input.existing ? undefined : `platform_package:${input.pkg.id}`,
    title: input.platformPackage.clip.title || input.pkg.sourceTitle,
    hook: compact(input.pkg.hook || input.candidate.hook_text || input.platformPackage.clip.title, 74),
    source_name: input.pkg.sourceName || input.source?.display_name || 'RBHQ Source',
    source_type: input.video.platform || 'youtube',
    thumbnail_url: input.video.thumbnail_url,
    video_url: input.asset.publicUrl,
    source_url: input.pkg.sourceUrl || input.video.video_url,
    original_platform: input.video.platform || 'youtube',
    import_batch_id: `platform-package:${input.now.slice(0, 10)}`,
    aspect_ratio: '9:16',
    duration_seconds: durationSeconds,
    ai_score: score,
    virality_score: score,
    hook_strength: score,
    sports_category: 'platform_package',
    recommended_hook: input.pkg.hook || input.candidate.hook_text || input.platformPackage.clip.title,
    moderation_notes: notes,
    risk_flags: riskFlags,
    status: 'approved',
    publish_status: 'ready_for_manual_publish',
    approved_at: input.now,
    ingested_at: input.now,
    ingestion_status: 'imported',
    updated_at: input.now,
  }
}

export async function createPlatformReadyPackageFromMacMini(
  supabase: PlatformBridgeDb,
  packageId: string,
  input: { now?: () => Date } = {},
): Promise<PackageToPlatformResult> {
  const pkg = await getMacMiniClipPackageById(supabase, packageId)
  if (!pkg) {
    throw new Error('Mac mini clip package not found.')
  }
  if (pkg.assetStatus !== 'attached' || !pkg.localAssetPath) {
    throw new Error('Platform package requires an attached local MP4 asset.')
  }

  const candidate = await loadCandidate(supabase, pkg.clipCandidateId)
  if (!hasApprovedCandidateStatus(candidate.status)) {
    throw new Error('Platform package requires an approved or promoted candidate.')
  }
  const video = firstJoined(candidate.ingested_videos)
  if (!video) {
    throw new Error('Platform package requires the source ingested video.')
  }
  const source = firstJoined(video.source_channels)
  const existing = await loadExistingClip(supabase, pkg, candidate)
  const asset = await storePlatformMp4Asset({
    localPath: pkg.localAssetPath,
    packageId: pkg.id,
    laneSlug: pkg.laneSlug,
    channelId: pkg.targetChannelId,
  })

  const now = (input.now ?? (() => new Date()))().toISOString()
  const provisionalClipId = existing?.id ?? `platform_package:${pkg.id}`
  const platformPackage = buildPlatformReadyPackage({
    pkg,
    candidate,
    video,
    source,
    asset,
    clipId: provisionalClipId,
    now,
  })
  const payload = clipPayload({
    pkg,
    candidate,
    video,
    source,
    asset,
    platformPackage,
    existing,
    now,
  })

  let clip: ClipRow
  if (existing) {
    const { data, error } = await supabase
      .from('clips')
      .update(payload)
      .eq('id', existing.id)
      .select('id, moderation_notes, risk_flags')
      .single()
    if (error || !data) throw new Error(error?.message || 'Platform-ready clip could not be updated.')
    clip = data as ClipRow
  } else {
    const { data, error } = await supabase
      .from('clips')
      .insert({
        ...payload,
        external_id: `platform_package:${pkg.id}`,
        created_at: now,
      })
      .select('id, moderation_notes, risk_flags')
      .single()
    if (error || !data) throw new Error(error?.message || 'Platform-ready clip could not be created.')
    clip = data as ClipRow
  }

  if (platformPackage.clipId !== clip.id) {
    platformPackage.clipId = clip.id
    const refreshedPayload = clipPayload({
      pkg,
      candidate,
      video,
      source,
      asset,
      platformPackage,
      existing: clip,
      now,
    })
    const { error } = await supabase
      .from('clips')
      .update({
        moderation_notes: refreshedPayload.moderation_notes,
        risk_flags: refreshedPayload.risk_flags,
        updated_at: now,
      })
      .eq('id', clip.id)
    if (error) throw new Error(error.message)
  }

  return {
    clipId: clip.id,
    packageId: pkg.id,
    candidateId: pkg.clipCandidateId,
    publishStatus: 'ready_for_manual_publish',
    publicUrl: asset.publicUrl,
    storageMode: asset.storageMode,
    storageReference: asset.objectKey,
    platformPackage,
    safety: platformPackage.safety,
  }
}

export function readPlatformPackageFromNotes(notes: string[] | null | undefined): PlatformReadyPackage | null {
  const note = notes?.find((item) => item.startsWith(PLATFORM_PACKAGE_NOTE_PREFIX))
  if (!note) return null
  try {
    const parsed = JSON.parse(note.slice(PLATFORM_PACKAGE_NOTE_PREFIX.length)) as PlatformReadyPackage
    return parsed?.version === 'rbhq-platform-export-v1' ? parsed : null
  } catch {
    return null
  }
}
