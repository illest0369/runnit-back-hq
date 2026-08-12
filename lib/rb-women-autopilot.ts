import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { buildPublishExportPackage } from './export/build-export'
import { sendClipToMetricool, validateMetricoolLiveConfigForChannel } from './metricool'
import {
  getClipById,
  getMetricoolWorkflowClips,
  isMetricoolExportReadyStatus,
  updateClipMetricoolStatus,
  type ModerationClip,
} from './moderation-queue'
import {
  createOpusSupabaseClient,
  runRBWomenOpusPipeline,
  type GeminiGenerationTelemetry,
  type OpusRunReport,
} from './rb-women-opus-pipeline'
import { RB_WOMEN_CHANNEL_ID } from './rb-women-source-config'

type AutopilotDb = SupabaseClient

type SourceResolution = {
  sourceId: string | null
  source: string
  sourceTitle: string | null
  sourceKind: 'source_path' | 'ingested_video' | 'source_channel_latest_video' | 'source_url'
}

type AutopilotClipReport = {
  clipId: string | null
  stage: string
  videoUrl: string | null
  publishStatus: string | null
  metricoolPostId: string | null
  scheduledAt: string | null
  failureStage: string | null
  error: string | null
}

type ExistingAutopilotOutput = {
  rank: number
  candidateId: string
  packageId: string | null
  clipId: string | null
  videoUrl: string | null
  publishStatus: string | null
  queueEligible: boolean
}

export type RBWomenAutopilotReport = {
  sourceId: string | null
  sourceTitle: string | null
  runId: string
  dryRun: boolean
  candidatesGenerated: number
  clipsSelected: number
  clipsRendered: number
  clipsUploaded: number
  clipsQueueReady: number
  clipsScheduled: number
  clipsFailed: number
  duplicatesPrevented: number
  processingTimeSeconds: number
  gemini?: GeminiGenerationTelemetry
  clips: AutopilotClipReport[]
}

export type RBWomenAutopilotInput = {
  sourceId?: string | null
  sourcePath?: string | null
  dryRun?: boolean
  assetRoot?: string | null
  writeReport?: boolean
  runId?: string | null
}

const FIRST_SCHEDULE_DELAY_MINUTES = 45
const SCHEDULE_SPACING_MINUTES = 90

function compact(value: string | null | undefined, maxLength = 500): string {
  const clean = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 3).trim()}...`
}

function stableRunId(value: string): string {
  return `rb-women-autopilot-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`
}

function readString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

async function maybeSingleById(db: AutopilotDb, table: string, id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from(table).select('*').eq('id', id).maybeSingle()
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null
    throw new Error(error.message)
  }
  return data as Record<string, unknown> | null
}

async function resolveSourceFromId(db: AutopilotDb, sourceId: string): Promise<SourceResolution> {
  const ingested = await maybeSingleById(db, 'ingested_videos', sourceId)
  if (ingested) {
    const source = readString(ingested, ['video_url'])
    if (!source) throw new Error(`Ingested video ${sourceId} has no video_url.`)
    return {
      sourceId,
      source,
      sourceTitle: readString(ingested, ['title']),
      sourceKind: 'ingested_video',
    }
  }

  const sourceChannel = await maybeSingleById(db, 'source_channels', sourceId)
  if (sourceChannel) {
    if (sourceChannel.target_rbhq_channel_id && sourceChannel.target_rbhq_channel_id !== RB_WOMEN_CHANNEL_ID) {
      throw new Error(`Source channel ${sourceId} is not RB Women.`)
    }
    const { data, error } = await db
      .from('ingested_videos')
      .select('video_url, title')
      .eq('source_channel_id', sourceId)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const source = data && typeof data.video_url === 'string' ? data.video_url.trim() : ''
    if (!source) {
      throw new Error(`Source channel ${sourceId} has no ingested video yet. Run existing RSS ingestion first or pass --source-path.`)
    }
    const sourceTitle = data && typeof data.title === 'string' ? data.title : readString(sourceChannel, ['display_name'])
    return {
      sourceId,
      source,
      sourceTitle,
      sourceKind: 'source_channel_latest_video',
    }
  }

  const sourceRow = await maybeSingleById(db, 'sources', sourceId)
  if (sourceRow) {
    if (sourceRow.channel_id && sourceRow.channel_id !== RB_WOMEN_CHANNEL_ID) {
      throw new Error(`Source ${sourceId} is not RB Women.`)
    }
    const source = readString(sourceRow, ['url', 'channel_url', 'source_url', 'rss_url'])
    if (!source) throw new Error(`Source ${sourceId} has no URL.`)
    return {
      sourceId,
      source,
      sourceTitle: readString(sourceRow, ['name', 'channel_name', 'display_name', 'handle']),
      sourceKind: 'source_url',
    }
  }

  throw new Error(`Source id ${sourceId} was not found in ingested_videos, source_channels, or sources.`)
}

export async function resolveRBWomenAutopilotSource(
  db: AutopilotDb,
  input: Pick<RBWomenAutopilotInput, 'sourceId' | 'sourcePath'>,
): Promise<SourceResolution> {
  const sourcePath = input.sourcePath?.trim()
  if (sourcePath) {
    return {
      sourceId: null,
      source: sourcePath,
      sourceTitle: null,
      sourceKind: 'source_path',
    }
  }

  const sourceId = input.sourceId?.trim()
  if (!sourceId) {
    throw new Error('Missing source input. Use --source-id <sourceId> or --source-path <localMp4>.')
  }

  return resolveSourceFromId(db, sourceId)
}

function scheduledAtForIndex(index: number, now = new Date()): string {
  return new Date(now.getTime() + (FIRST_SCHEDULE_DELAY_MINUTES + index * SCHEDULE_SPACING_MINUTES) * 60_000).toISOString()
}

function schedulerEndpoint(apiUrl: string, blogId: string, userId: string): URL {
  const url = new URL(`${apiUrl.replace(/\/+$/, '')}/v2/scheduler/posts`)
  url.searchParams.set('blogId', blogId)
  url.searchParams.set('userId', userId)
  return url
}

async function metricoolDuplicateExists(input: {
  clipId: string
  packageId: string | null
  mediaUrl: string | null
  scheduledAt: string
}): Promise<boolean> {
  const apiUrl = process.env.METRICOOL_API_URL?.trim()
  const apiKey = process.env.METRICOOL_API_KEY?.trim()
  const userId = process.env.METRICOOL_USER_ID?.trim()
  const blogId = process.env.METRICOOL_BRAND_RB_WOMEN?.trim()
  if (!apiUrl || !apiKey || !userId || !blogId) return false

  const timezone = process.env.METRICOOL_TIMEZONE?.trim() || 'America/Los_Angeles'
  const scheduled = new Date(input.scheduledAt)
  const start = new Date(scheduled.getTime() - 24 * 60 * 60_000)
  const end = new Date(scheduled.getTime() + 24 * 60 * 60_000)
  const url = schedulerEndpoint(apiUrl, blogId, userId)
  url.searchParams.set('start', start.toISOString().slice(0, 19))
  url.searchParams.set('end', end.toISOString().slice(0, 19))
  url.searchParams.set('timezone', timezone)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Mc-Auth': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Metricool duplicate check failed with HTTP ${response.status}.`)
  }
  const body = await response.json().catch(() => null) as { data?: unknown } | null
  const items = Array.isArray(body?.data) ? body.data : []
  const mediaNeedle = input.mediaUrl?.trim().toLowerCase() ?? ''
  const idNeedles = [
    input.clipId,
    input.packageId ? `platform_package:${input.packageId}` : null,
    input.packageId,
  ].filter((value): value is string => Boolean(value?.trim())).map((value) => value.toLowerCase())

  return items.some((item) => {
    const serialized = JSON.stringify(item).toLowerCase()
    if (mediaNeedle && serialized.includes(mediaNeedle)) return true
    return idNeedles.some((needle) => serialized.includes(needle))
  })
}

function readAutopilotRank(value: unknown, notes: unknown, rankSource: string | null): number | null {
  if (value && typeof value === 'object') {
  const rank = (value as { autopilotRank?: unknown }).autopilotRank
  const parsed = typeof rank === 'number' ? rank : Number(rank)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }

  if (Array.isArray(notes)) {
    for (const note of notes) {
      if (typeof note !== 'string') continue
      const match = /^autopilot_rank:(\d+)$/.exec(note.trim())
      if (match) return Number(match[1])
    }
  }

  const assetMatch = rankSource?.match(/rank-(\d+)(?:\D|$)/)
  return assetMatch ? Number(assetMatch[1]) : null
}

async function loadExistingAutopilotOutputs(
  db: AutopilotDb,
  runId: string,
): Promise<ExistingAutopilotOutput[]> {
  const { data: candidates, error: candidateError } = await db
    .from('clip_candidates')
    .select('id, score_breakdown, edit_notes')
    .eq('target_channel_id', RB_WOMEN_CHANNEL_ID)
    .contains('edit_notes', [`autopilot_run:${runId}`])
    .order('created_at', { ascending: true })

  if (candidateError) throw new Error(candidateError.message)
  const candidateRows = (candidates ?? []) as Array<{ id: string; score_breakdown: unknown; edit_notes: unknown }>
  if (candidateRows.length === 0) return []

  const candidateIds = candidateRows.map((candidate) => candidate.id)
  const { data: packages, error: packageError } = await db
    .from('mac_mini_clip_packages')
    .select('id, clip_candidate_id, asset_public_url, local_asset_path')
    .in('clip_candidate_id', candidateIds)

  if (packageError) throw new Error(packageError.message)
  const packageRows = (packages ?? []) as Array<{
    id: string
    clip_candidate_id: string | null
    asset_public_url: string | null
    local_asset_path: string | null
  }>

  const packagesByCandidate = new Map<string, typeof packageRows[number]>()
  for (const pkg of packageRows) {
    if (pkg.clip_candidate_id && !packagesByCandidate.has(pkg.clip_candidate_id)) {
      packagesByCandidate.set(pkg.clip_candidate_id, pkg)
    }
  }

  const externalIds = packageRows.map((pkg) => `platform_package:${pkg.id}`)
  const { data: clips, error: clipError } = externalIds.length > 0
    ? await db
      .from('clips')
      .select('id, external_id, video_url, publish_status')
      .in('external_id', externalIds)
    : { data: [], error: null }

  if (clipError) throw new Error(clipError.message)
  const clipRows = (clips ?? []) as Array<{
    id: string
    external_id: string | null
    video_url: string | null
    publish_status: string | null
  }>

  const clipsByExternalId = new Map(clipRows.map((clip) => [clip.external_id, clip]))
  const workflow = await getMetricoolWorkflowClips({ limit: 200, channelIds: [RB_WOMEN_CHANNEL_ID] })
  const workflowClipIds = new Set(workflow.map((clip) => clip.id))

  const outputs = candidateRows
    .map((candidate) => {
      const pkg = packagesByCandidate.get(candidate.id) ?? null
      const rankSource = `${pkg?.asset_public_url ?? ''} ${pkg?.local_asset_path ?? ''}`
      const rank = readAutopilotRank(candidate.score_breakdown, candidate.edit_notes, rankSource)
      if (!rank) return null
      const clip = pkg ? clipsByExternalId.get(`platform_package:${pkg.id}`) ?? null : null
      return {
        rank,
        candidateId: candidate.id,
        packageId: pkg?.id ?? null,
        clipId: clip?.id ?? null,
        videoUrl: clip?.video_url ?? pkg?.asset_public_url ?? null,
        publishStatus: clip?.publish_status ?? null,
        queueEligible: clip?.id ? workflowClipIds.has(clip.id) : false,
      }
    })
    .filter((output): output is ExistingAutopilotOutput => Boolean(output))

  const latestByRank = new Map<number, ExistingAutopilotOutput>()
  for (const output of outputs) {
    if (!output.queueEligible) continue
    latestByRank.set(output.rank, output)
  }

  return Array.from(latestByRank.values()).sort((left, right) => left.rank - right.rank)
}

function clipStageFromReport(clip: OpusRunReport['clips'][number], scheduled: boolean): string {
  if (scheduled) return 'scheduled'
  if (clip.failure) return 'failed'
  return clip.stage ?? (clip.queueEligible ? 'queue_ready' : clip.publicUrl ? 'uploaded' : clip.localVerticalPath ? 'rendered' : 'selected')
}

async function scheduleAutopilotClip(input: {
  clipId: string
  scheduledAt: string
}): Promise<{ scheduled: boolean; scheduledAt: string | null; metricoolPostId: string | null; publishStatus: string | null; error: string | null; duplicate: boolean }> {
  const clip = await getClipById(input.clipId, { channelIds: [RB_WOMEN_CHANNEL_ID], includeMetricoolHandoffStatus: false })
  if (!clip) {
    return { scheduled: false, scheduledAt: null, metricoolPostId: null, publishStatus: null, error: 'Clip not found.', duplicate: false }
  }
  const exportPackage = buildPublishExportPackage(clip)
  if (clip.publish_status === 'metricool_scheduled') {
    return { scheduled: false, scheduledAt: null, metricoolPostId: null, publishStatus: clip.publish_status, error: null, duplicate: true }
  }
  const packageId = clip.external_id?.startsWith('platform_package:')
    ? clip.external_id.slice('platform_package:'.length)
    : null
  const duplicate = await metricoolDuplicateExists({
    clipId: clip.id,
    packageId,
    mediaUrl: exportPackage.rendered_mp4_url ?? clip.video_url,
    scheduledAt: input.scheduledAt,
  })
  if (duplicate) {
    return { scheduled: false, scheduledAt: null, metricoolPostId: null, publishStatus: clip.publish_status, error: null, duplicate: true }
  }

  const liveConfig = validateMetricoolLiveConfigForChannel(clip.channel_id)
  if (!liveConfig.ok) {
    return { scheduled: false, scheduledAt: null, metricoolPostId: null, publishStatus: clip.publish_status, error: liveConfig.error, duplicate: false }
  }
  if (clip.status !== 'approved' || !isMetricoolExportReadyStatus(clip.publish_status)) {
    return { scheduled: false, scheduledAt: null, metricoolPostId: null, publishStatus: clip.publish_status, error: 'Clip is not approved and Metricool-ready.', duplicate: false }
  }
  if (!clip.video_url?.startsWith('https://')) {
    return { scheduled: false, scheduledAt: null, metricoolPostId: null, publishStatus: clip.publish_status, error: 'Clip is missing an HTTPS R2 video URL.', duplicate: false }
  }
  if (exportPackage.hashtags.length !== 5) {
    return { scheduled: false, scheduledAt: null, metricoolPostId: null, publishStatus: clip.publish_status, error: 'Clip does not have exactly 5 hashtags.', duplicate: false }
  }

  const workflow = await getMetricoolWorkflowClips({ limit: 200, channelIds: [RB_WOMEN_CHANNEL_ID] })
  if (!workflow.some((item) => item.id === clip.id)) {
    return { scheduled: false, scheduledAt: null, metricoolPostId: null, publishStatus: clip.publish_status, error: 'Clip is not present in the Metricool workflow queue.', duplicate: false }
  }

  const metricool = await sendClipToMetricool(clip, { mode: 'schedule', scheduledAt: input.scheduledAt })
  const nextPublishStatus = metricool.status === 'accepted' && metricool.publishStatus === 'metricool_scheduled'
    ? 'metricool_scheduled'
    : 'metricool_failed'
  const updated = await updateClipMetricoolStatus(clip.id, {
    channelIds: [RB_WOMEN_CHANNEL_ID],
    publishStatus: nextPublishStatus,
    metricoolPostId: metricool.metricoolPostId,
  })

  return {
    scheduled: metricool.status === 'accepted',
    scheduledAt: metricool.status === 'accepted' ? input.scheduledAt : null,
    metricoolPostId: metricool.metricoolPostId,
    publishStatus: updated?.publish_status ?? metricool.publishStatus,
    error: metricool.error,
    duplicate: false,
  }
}

async function hydrateClip(clipId: string | null): Promise<ModerationClip | null> {
  if (!clipId) return null
  return getClipById(clipId, { channelIds: [RB_WOMEN_CHANNEL_ID], includeMetricoolHandoffStatus: true })
}

export async function runRBWomenAutopilot(input: RBWomenAutopilotInput): Promise<RBWomenAutopilotReport> {
  const startedAt = Date.now()
  const db = createOpusSupabaseClient()
  const source = await resolveRBWomenAutopilotSource(db, input)
  const runId = compact(input.runId, 100) || stableRunId(`${source.sourceKind}:${source.sourceId ?? source.source}`)
  const dryRun = input.dryRun !== false
  const existingOutputs = await loadExistingAutopilotOutputs(db, runId)
  const existingQueueReady = existingOutputs.filter((clip) => clip.clipId && clip.queueEligible)

  if (existingQueueReady.length > 0) {
    const scheduledByClipId = new Map<string, Awaited<ReturnType<typeof scheduleAutopilotClip>>>()
    let duplicatesPrevented = 0
    if (!dryRun) {
      for (let index = 0; index < existingQueueReady.length; index += 1) {
        const clipId = existingQueueReady[index]?.clipId
        if (!clipId) continue
        const scheduled = await scheduleAutopilotClip({
          clipId,
          scheduledAt: scheduledAtForIndex(index),
        })
        if (scheduled.duplicate) duplicatesPrevented += 1
        scheduledByClipId.set(clipId, scheduled)
      }
    }

    const clips: AutopilotClipReport[] = []
    for (const output of existingQueueReady) {
      const dbClip = await hydrateClip(output.clipId)
      const scheduled = output.clipId ? scheduledByClipId.get(output.clipId) : null
      clips.push({
        clipId: output.clipId,
        stage: scheduled?.scheduled ? 'scheduled' : 'queue_ready',
        videoUrl: dbClip?.video_url ?? output.videoUrl,
        publishStatus: scheduled?.publishStatus ?? dbClip?.publish_status ?? output.publishStatus,
        metricoolPostId: scheduled?.metricoolPostId ?? null,
        scheduledAt: scheduled?.scheduledAt ?? null,
        failureStage: scheduled?.error ? 'scheduled' : null,
        error: scheduled?.error ?? null,
      })
    }

    return {
      sourceId: source.sourceId,
      sourceTitle: source.sourceTitle,
      runId,
      dryRun,
      candidatesGenerated: existingOutputs.length,
      clipsSelected: existingOutputs.length,
      clipsRendered: existingQueueReady.length,
      clipsUploaded: existingQueueReady.filter((clip) => Boolean(clip.videoUrl)).length,
      clipsQueueReady: existingQueueReady.length,
      clipsScheduled: clips.filter((clip) => clip.stage === 'scheduled').length,
      clipsFailed: clips.filter((clip) => clip.error).length,
      duplicatesPrevented,
      processingTimeSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
      clips,
    }
  }

  const opus = await runRBWomenOpusPipeline(db, {
    source: source.source,
    title: source.sourceTitle,
    assetRoot: input.assetRoot,
    writeReport: input.writeReport,
    runId,
  })

  const scheduledByClipId = new Map<string, Awaited<ReturnType<typeof scheduleAutopilotClip>>>()
  let duplicatesPrevented = 0
  if (!dryRun) {
    const readyClips = opus.clips.filter((clip) => clip.clipId && clip.queueEligible && !clip.failure)
    for (let index = 0; index < readyClips.length; index += 1) {
      const clipId = readyClips[index]?.clipId
      if (!clipId) continue
      const scheduled = await scheduleAutopilotClip({
        clipId,
        scheduledAt: scheduledAtForIndex(index),
      })
      if (scheduled.duplicate) duplicatesPrevented += 1
      scheduledByClipId.set(clipId, scheduled)
    }
  }

  const clips: AutopilotClipReport[] = []
  for (const clip of opus.clips) {
    const dbClip = await hydrateClip(clip.clipId)
    const scheduled = clip.clipId ? scheduledByClipId.get(clip.clipId) : null
    clips.push({
      clipId: clip.clipId,
      stage: clipStageFromReport(clip, Boolean(scheduled?.scheduled)),
      videoUrl: dbClip?.video_url ?? clip.publicUrl,
      publishStatus: scheduled?.publishStatus ?? dbClip?.publish_status ?? null,
      metricoolPostId: scheduled?.metricoolPostId ?? null,
      scheduledAt: scheduled?.scheduledAt ?? null,
      failureStage: clip.failure ? clip.stage ?? 'failed' : scheduled?.error ? 'scheduled' : null,
      error: clip.failure ?? scheduled?.error ?? null,
    })
  }

  return {
    sourceId: source.sourceId,
    sourceTitle: opus.source.title,
    runId,
    dryRun,
    candidatesGenerated: opus.geminiCandidatesReturned,
    clipsSelected: opus.clipsSelected,
    clipsRendered: opus.clips.filter((clip) => Boolean(clip.localVerticalPath) || clip.stage === 'queue_ready').length,
    clipsUploaded: opus.clips.filter((clip) => Boolean(clip.publicUrl)).length,
    clipsQueueReady: opus.clips.filter((clip) => clip.queueEligible).length,
    clipsScheduled: clips.filter((clip) => clip.stage === 'scheduled').length,
    clipsFailed: clips.filter((clip) => clip.error).length,
    duplicatesPrevented,
    processingTimeSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
    gemini: opus.gemini,
    clips,
  }
}
