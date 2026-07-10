import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  buildClipPrepV1,
  readClipPrepFromCandidate,
  type ClipPrepV1,
} from './clip-prep'
import { syncLoadedCandidateIntelligenceV1 } from './candidate-intelligence'
import { getChannelMeta } from './channel-meta'
import { deriveTikTokStagingStatus, type TikTokStagingStatus } from './operator-staging'

export type MacMiniPackageStatus = 'ready' | 'fetched' | 'dry_run_complete' | 'dry_run_failed' | 'cancelled'
export type MacMiniHandoffStatus = 'pending' | 'fetched' | 'dry_run_succeeded' | 'dry_run_failed' | 'cancelled'
export type MacMiniDryRunStatus = 'success' | 'failure'
export type MacMiniAssetStatus = 'missing' | 'attached' | 'invalid'

export type MacMiniClipPackagePayload = {
  version: 'rbhq-mac-mini-clip-package-v1'
  targetPlatform: 'tiktok'
  publishAction: 'dry_run'
  testMode: true
  packageId: string
  candidateId: string
  lane: {
    label: string
    slug: string
    browserChannelKey: string
    targetChannelId: string
  }
  source: {
    url: string
    title: string
    name: string
  }
  localAssetPath?: string | null
  asset?: {
    localPath: string | null
    status: MacMiniAssetStatus
    error: string | null
  }
  clipPrep: ClipPrepV1
  tiktokDraft: {
    title: string
    hook: string
    caption: string
    hashtags: string[]
    sourceVideoUrl: string
    mediaPath?: string | null
    localPath?: string | null
    whyNow: string
    operatorSummary: string
    editNotes: string[]
    publishAction: 'dry_run'
    testMode: true
  }
  safety: {
    livePostingAllowed: false
    metricoolAllowed: false
    schedulerDependencyAllowed: false
    operatorCredentialsRequired: false
    finalPostClickAllowed: false
  }
  createdAt: string
}

export type MacMiniClipPackage = {
  id: string
  clipCandidateId: string
  ingestedVideoId: string
  targetChannelId: string
  laneLabel: string
  laneSlug: string
  browserChannelKey: string
  sourceUrl: string
  sourceTitle: string
  sourceName: string
  caption: string
  hashtags: string[]
  whyNow: string
  hook: string
  operatorSummary: string
  editNotes: string[]
  score: number
  packageStatus: MacMiniPackageStatus
  handoffStatus: MacMiniHandoffStatus
  payload: MacMiniClipPackagePayload
  workerId: string | null
  fetchedAt: string | null
  dryRunAt: string | null
  dryRunResult: Record<string, unknown> | null
  dryRunError: string | null
  localAssetPath: string | null
  assetStatus: MacMiniAssetStatus
  assetError: string | null
  assetAttachedAt: string | null
  tikTokStagingStatus: TikTokStagingStatus
  tikTokStagingRequestedAt: string | null
  tikTokStagingRequestedBy: string | null
  tikTokStagingAt: string | null
  tikTokStagingError: string | null
  createdAt: string
  updatedAt: string
}

type MacMiniDb = Pick<SupabaseClient, 'from'>

type ClipCandidateForPackage = {
  id: string
  ingested_video_id: string
  target_channel_id: string | null
  start_seconds: number | string | null
  end_seconds: number | string | null
  title: string
  summary: string | null
  hook_text: string | null
  caption: string | null
  hashtags: string[] | null
  score: number | string | null
  score_breakdown: Record<string, unknown> | null
  clip_prep: ClipPrepV1 | null
  suggested_clip_start_seconds: number | string | null
  suggested_clip_end_seconds: number | string | null
  suggested_clip_length_seconds: number | string | null
  clip_reason: string | null
  opening_text: string | null
  edit_notes: string[] | null
  asset_instructions: string | null
  clip_prep_status: string | null
  clip_prep_confidence: string | null
  status: string
  ingested_videos: JoinedIngestedVideo | JoinedIngestedVideo[] | null
}

type JoinedIngestedVideo = {
  id: string
  title: string
  description: string | null
  platform?: string | null
  video_url: string
  published_at: string | null
  duration_seconds: number | string | null
  source_channels: JoinedSourceChannel | JoinedSourceChannel[] | null
}

type JoinedSourceChannel = {
  display_name: string
  target_rbhq_channel_id: string | null
}

type MacMiniClipPackageRow = {
  id: string
  clip_candidate_id: string
  ingested_video_id: string
  target_channel_id: string
  lane_label: string
  lane_slug: string
  browser_channel_key: string
  source_url: string
  source_title: string
  source_name: string
  caption: string
  hashtags: string[] | null
  why_now: string
  hook: string
  operator_summary: string
  edit_notes: string[] | null
  score: number | string | null
  package_payload: MacMiniClipPackagePayload
  package_status: MacMiniPackageStatus
  handoff_status: MacMiniHandoffStatus
  worker_id: string | null
  fetched_at: string | null
  dry_run_at: string | null
  dry_run_result: Record<string, unknown> | null
  dry_run_error: string | null
  local_asset_path: string | null
  asset_status: MacMiniAssetStatus | null
  asset_error: string | null
  asset_attached_at: string | null
  tiktok_staging_status: TikTokStagingStatus | null
  tiktok_staging_requested_at: string | null
  tiktok_staging_requested_by: string | null
  tiktok_staging_at: string | null
  tiktok_staging_error: string | null
  created_at: string
  updated_at: string
}

const PACKAGE_SELECT = [
  'id',
  'clip_candidate_id',
  'ingested_video_id',
  'target_channel_id',
  'lane_label',
  'lane_slug',
  'browser_channel_key',
  'source_url',
  'source_title',
  'source_name',
  'caption',
  'hashtags',
  'why_now',
  'hook',
  'operator_summary',
  'edit_notes',
  'score',
  'package_payload',
  'package_status',
  'handoff_status',
  'worker_id',
  'fetched_at',
  'dry_run_at',
  'dry_run_result',
  'dry_run_error',
  'local_asset_path',
  'asset_status',
  'asset_error',
  'asset_attached_at',
  'tiktok_staging_status',
  'tiktok_staging_requested_at',
  'tiktok_staging_requested_by',
  'tiktok_staging_at',
  'tiktok_staging_error',
  'created_at',
  'updated_at',
].join(', ')

const HIGH_PRIORITY_SCORE = 76
const DEFAULT_MAC_MINI_ASSET_ROOT = path.join(process.cwd(), 'tmp', 'mac-mini-assets')

function compact(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function readNumber(value: number | string | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function stringArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value)
    ? value.map(compact).filter(Boolean)
    : []
}

function readBreakdownString(breakdown: Record<string, unknown> | null, key: string): string {
  const value = breakdown?.[key]
  return typeof value === 'string' ? compact(value) : ''
}

function readBreakdownReasons(breakdown: Record<string, unknown> | null): string[] {
  const reasons = breakdown?.reasons
  return Array.isArray(reasons)
    ? reasons.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function browserChannelKeyForSlug(slug: string): string | null {
  const keys: Record<string, string> = {
    sports: 'rb_sports',
    arena: 'rb_arena',
    women: 'rb_women',
    combat: 'rb_combat',
    futbol: 'rb_futbol',
    runnitbackcfb: 'rb_cfb',
  }
  return keys[slug] ?? null
}

function hasApprovedCandidateStatus(status: string): boolean {
  return ['approved', 'approved_for_review', 'approved_for_handoff', 'promoted'].includes(status)
}

function isHighPriorityCandidate(candidate: ClipCandidateForPackage): boolean {
  const score = readNumber(candidate.score)
  const rankLabel = readBreakdownString(candidate.score_breakdown, 'rankLabel')
  const urgency = readBreakdownString(candidate.score_breakdown, 'urgency')
  return score >= HIGH_PRIORITY_SCORE || rankLabel === 'must_post' || rankLabel === 'strong' || urgency === 'post_now'
}

function assertPackageEligible(candidate: ClipCandidateForPackage): void {
  if (candidate.status === 'rejected') {
    throw new Error(`Candidate status ${candidate.status} cannot be packaged for Mac mini handoff.`)
  }
  if (!hasApprovedCandidateStatus(candidate.status) && !isHighPriorityCandidate(candidate)) {
    throw new Error('Mac mini package requires an approved candidate status or high-priority candidate score.')
  }
}

function normalizePackageRow(row: MacMiniClipPackageRow): MacMiniClipPackage {
  return {
    id: row.id,
    clipCandidateId: row.clip_candidate_id,
    ingestedVideoId: row.ingested_video_id,
    targetChannelId: row.target_channel_id,
    laneLabel: row.lane_label,
    laneSlug: row.lane_slug,
    browserChannelKey: row.browser_channel_key,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    sourceName: row.source_name,
    caption: row.caption,
    hashtags: stringArray(row.hashtags),
    whyNow: row.why_now,
    hook: row.hook,
    operatorSummary: row.operator_summary,
    editNotes: stringArray(row.edit_notes),
    score: Math.round(readNumber(row.score)),
    packageStatus: row.package_status,
    handoffStatus: row.handoff_status,
    payload: row.package_payload,
    workerId: row.worker_id,
    fetchedAt: row.fetched_at,
    dryRunAt: row.dry_run_at,
    dryRunResult: row.dry_run_result ?? null,
    dryRunError: row.dry_run_error,
    localAssetPath: row.local_asset_path,
    assetStatus: row.asset_status ?? 'missing',
    assetError: row.asset_error,
    assetAttachedAt: row.asset_attached_at,
    tikTokStagingStatus: row.tiktok_staging_status ?? 'not_requested',
    tikTokStagingRequestedAt: row.tiktok_staging_requested_at,
    tikTokStagingRequestedBy: row.tiktok_staging_requested_by,
    tikTokStagingAt: row.tiktok_staging_at,
    tikTokStagingError: row.tiktok_staging_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getMacMiniAssetRoot(): string {
  return path.resolve(process.env.MAC_MINI_ASSET_ROOT?.trim() || DEFAULT_MAC_MINI_ASSET_ROOT)
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function assertDryRunPayload(payload: MacMiniClipPackagePayload): void {
  if (payload.targetPlatform !== 'tiktok') {
    throw new Error('Mac mini package asset attach requires targetPlatform=tiktok.')
  }
  if (payload.publishAction !== 'dry_run') {
    throw new Error('Mac mini package asset attach requires publishAction=dry_run.')
  }
  if (payload.testMode !== true) {
    throw new Error('Mac mini package asset attach requires testMode=true.')
  }
  if (payload.safety.finalPostClickAllowed !== false || payload.safety.livePostingAllowed !== false) {
    throw new Error('Mac mini package asset attach requires final-post/live-post safety flags.')
  }
}

export async function validateMacMiniLocalAssetPath(
  assetPath: string,
  input: { assetRoot?: string } = {},
): Promise<{ ok: true; absolutePath: string; assetRoot: string } | { ok: false; absolutePath: string; assetRoot: string; error: string }> {
  const absolutePath = path.resolve(assetPath)
  const assetRoot = path.resolve(input.assetRoot || getMacMiniAssetRoot())

  if (!isPathInside(assetRoot, absolutePath)) {
    return {
      ok: false,
      absolutePath,
      assetRoot,
      error: `Local asset path must be inside ${assetRoot}.`,
    }
  }

  if (!absolutePath.toLowerCase().endsWith('.mp4')) {
    return {
      ok: false,
      absolutePath,
      assetRoot,
      error: 'Local asset path must point to an .mp4 file.',
    }
  }

  const assetStat = await stat(absolutePath).catch(() => null)
  if (!assetStat?.isFile()) {
    return {
      ok: false,
      absolutePath,
      assetRoot,
      error: 'Local asset file does not exist or is not a file.',
    }
  }

  return { ok: true, absolutePath, assetRoot }
}

function payloadWithLocalAsset(
  payload: MacMiniClipPackagePayload,
  input: { localAssetPath: string | null; assetStatus: MacMiniAssetStatus; assetError: string | null },
): MacMiniClipPackagePayload {
  assertDryRunPayload(payload)
  return {
    ...payload,
    localAssetPath: input.localAssetPath,
    asset: {
      localPath: input.localAssetPath,
      status: input.assetStatus,
      error: input.assetError,
    },
    tiktokDraft: {
      ...payload.tiktokDraft,
      mediaPath: input.localAssetPath,
      localPath: input.localAssetPath,
      publishAction: 'dry_run',
      testMode: true,
    },
  }
}

function buildPayload(input: {
  packageId: string
  candidate: ClipCandidateForPackage
  targetChannelId: string
  laneLabel: string
  laneSlug: string
  browserChannelKey: string
  sourceName: string
  sourceTitle: string
  sourceUrl: string
  caption: string
  hashtags: string[]
  hook: string
  whyNow: string
  operatorSummary: string
  editNotes: string[]
  clipPrep: ClipPrepV1
  now: string
}): MacMiniClipPackagePayload {
  return {
    version: 'rbhq-mac-mini-clip-package-v1',
    targetPlatform: 'tiktok',
    publishAction: 'dry_run',
    testMode: true,
    packageId: input.packageId,
    candidateId: input.candidate.id,
    lane: {
      label: input.laneLabel,
      slug: input.laneSlug,
      browserChannelKey: input.browserChannelKey,
      targetChannelId: input.targetChannelId,
    },
    source: {
      url: input.sourceUrl,
      title: input.sourceTitle,
      name: input.sourceName,
    },
    localAssetPath: null,
    asset: {
      localPath: null,
      status: 'missing',
      error: null,
    },
    clipPrep: input.clipPrep,
    tiktokDraft: {
      title: input.candidate.title || input.sourceTitle,
      hook: input.hook,
      caption: input.caption,
      hashtags: input.hashtags,
      sourceVideoUrl: input.sourceUrl,
      mediaPath: null,
      localPath: null,
      whyNow: input.whyNow,
      operatorSummary: input.operatorSummary,
      editNotes: input.editNotes,
      publishAction: 'dry_run',
      testMode: true,
    },
    safety: {
      livePostingAllowed: false,
      metricoolAllowed: false,
      schedulerDependencyAllowed: false,
      operatorCredentialsRequired: false,
      finalPostClickAllowed: false,
    },
    createdAt: input.now,
  }
}

export async function createMacMiniClipPackageFromCandidate(
  supabase: MacMiniDb,
  candidateId: string,
  input: { now?: () => Date; packageId?: string } = {},
): Promise<MacMiniClipPackage> {
  const { data: existing, error: existingError } = await supabase
    .from('mac_mini_clip_packages')
    .select(PACKAGE_SELECT)
    .eq('clip_candidate_id', candidateId)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (existing) return normalizePackageRow(existing as unknown as MacMiniClipPackageRow)

  const { data: candidateData, error: candidateError } = await supabase
    .from('clip_candidates')
    .select(
      `id, ingested_video_id, target_channel_id, start_seconds, end_seconds, title, summary, hook_text, caption, hashtags, score, score_breakdown,
       clip_prep, suggested_clip_start_seconds, suggested_clip_end_seconds, suggested_clip_length_seconds, clip_reason, opening_text, edit_notes,
       asset_instructions, clip_prep_status, clip_prep_confidence, status,
       ingested_videos!inner (
         id, title, description, platform, video_url, published_at, duration_seconds,
         source_channels ( display_name, target_rbhq_channel_id )
       )`,
    )
    .eq('id', candidateId)
    .single()

  if (candidateError || !candidateData) {
    throw new Error(candidateError?.message || 'Clip candidate not found.')
  }

  const candidate = candidateData as ClipCandidateForPackage
  if (candidate.status === 'rejected') {
    assertPackageEligible(candidate)
  }

  const video = firstJoined(candidate.ingested_videos)
  if (!video?.video_url?.trim()) {
    throw new Error('Mac mini package requires an ingested source video URL.')
  }

  const source = firstJoined(video.source_channels)
  const targetChannelId = candidate.target_channel_id ?? source?.target_rbhq_channel_id ?? null
  if (!targetChannelId) {
    throw new Error('Mac mini package requires a target RBHQ channel.')
  }

  const channel = getChannelMeta(targetChannelId)
  if (!channel) {
    throw new Error(`Mac mini package target channel is unsupported: ${targetChannelId}.`)
  }

  const browserChannelKey = browserChannelKeyForSlug(channel.slug)
  if (!browserChannelKey) {
    throw new Error(`Mac mini package lane has no browser profile key: ${channel.slug}.`)
  }

  const nowDate = (input.now ?? (() => new Date()))()
  const sync = await syncLoadedCandidateIntelligenceV1(supabase, candidate, { now: () => nowDate })
  Object.assign(candidate, sync.update)
  assertPackageEligible(candidate)

  const now = nowDate.toISOString()
  const packageId = input.packageId ?? randomUUID()
  const scoreBreakdown = candidate.score_breakdown ?? {}
  const sourceName = compact(source?.display_name) || 'RBHQ Source'
  const sourceTitle = compact(video.title || candidate.title)
  const sourceUrl = compact(video.video_url)
  const caption = compact(candidate.caption) || compact(candidate.title)
  const hashtags = stringArray(candidate.hashtags)
  const hook = compact(candidate.hook_text) || compact(candidate.title)
  const clipPrep = readClipPrepFromCandidate(candidate) ?? buildClipPrepV1({
    candidate,
    video: {
      id: video.id,
      title: sourceTitle,
      description: video.description,
      video_url: sourceUrl,
      published_at: video.published_at,
      duration_seconds: video.duration_seconds,
    },
    source: {
      display_name: sourceName,
      target_rbhq_channel_id: source?.target_rbhq_channel_id ?? null,
    },
    transcript: null,
  })
  const whyNow = readBreakdownString(scoreBreakdown, 'whyNow') || 'Approved candidate is queued for Mac mini dry-run review.'
  const operatorSummary = compact(candidate.summary) || readBreakdownString(scoreBreakdown, 'operatorSummary') || 'Mac mini dry-run package is ready for operator review.'
  const editNotes = [
    `clip_prep_status:${clipPrep.status}`,
    `clip_prep_confidence:${clipPrep.confidence}`,
    ...clipPrep.edit_notes,
    ...readBreakdownReasons(scoreBreakdown),
    candidate.start_seconds !== null ? `candidate_start_seconds:${candidate.start_seconds}` : '',
    candidate.end_seconds !== null ? `candidate_end_seconds:${candidate.end_seconds}` : '',
    'Dry-run only: local browser worker must not click final TikTok Post.',
  ].map(compact).filter(Boolean)
  const payload = buildPayload({
    packageId,
    candidate,
    targetChannelId,
    laneLabel: channel.label,
    laneSlug: channel.slug,
    browserChannelKey,
    sourceName,
    sourceTitle,
    sourceUrl,
    caption,
    hashtags,
    hook,
    whyNow,
    operatorSummary,
    editNotes,
    clipPrep,
    now,
  })

  const { data: inserted, error: insertError } = await supabase
    .from('mac_mini_clip_packages')
    .insert({
      id: packageId,
      clip_candidate_id: candidate.id,
      ingested_video_id: video.id,
      target_channel_id: targetChannelId,
      lane_label: channel.label,
      lane_slug: channel.slug,
      browser_channel_key: browserChannelKey,
      source_url: sourceUrl,
      source_title: sourceTitle,
      source_name: sourceName,
      caption,
      hashtags,
      why_now: whyNow,
      hook,
      operator_summary: operatorSummary,
      edit_notes: editNotes,
      score: readNumber(candidate.score),
      score_breakdown: scoreBreakdown,
      package_payload: payload,
      package_status: 'ready',
      handoff_status: 'pending',
      local_asset_path: null,
      asset_status: 'missing',
      asset_error: null,
      asset_attached_at: null,
      tiktok_staging_status: 'not_requested',
      tiktok_staging_requested_at: null,
      tiktok_staging_requested_by: null,
      tiktok_staging_at: null,
      tiktok_staging_error: null,
      created_at: now,
      updated_at: now,
    })
    .select(PACKAGE_SELECT)
    .single()

  if (insertError || !inserted) {
    throw new Error(insertError?.message || 'Mac mini clip package could not be created.')
  }

  return normalizePackageRow(inserted as unknown as MacMiniClipPackageRow)
}

export async function getPendingMacMiniClipPackages(
  supabase: MacMiniDb,
  input: { limit?: number; stagingStatus?: TikTokStagingStatus } = {},
): Promise<MacMiniClipPackage[]> {
  let query = supabase
    .from('mac_mini_clip_packages')
    .select(PACKAGE_SELECT)
  if (input.stagingStatus === 'ready_for_manual_post') {
    query = query
      .in('package_status', ['ready', 'dry_run_complete', 'dry_run_failed'])
      .in('handoff_status', ['pending', 'dry_run_succeeded', 'dry_run_failed'])
  } else {
    query = query
      .eq('package_status', 'ready')
      .eq('handoff_status', 'pending')
  }
  if (input.stagingStatus) {
    query = query.eq('tiktok_staging_status', input.stagingStatus)
  }
  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(input.limit ?? 10)

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as MacMiniClipPackageRow[]).map(normalizePackageRow)
}

export async function getMacMiniClipPackageById(
  supabase: MacMiniDb,
  packageId: string,
): Promise<MacMiniClipPackage | null> {
  const { data, error } = await supabase
    .from('mac_mini_clip_packages')
    .select(PACKAGE_SELECT)
    .eq('id', packageId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? normalizePackageRow(data as unknown as MacMiniClipPackageRow) : null
}

export async function requestTikTokStagingForPackage(
  supabase: MacMiniDb,
  packageId: string,
  input: { requestedBy?: string | null; now?: () => Date } = {},
): Promise<MacMiniClipPackage> {
  const current = await getMacMiniClipPackageById(supabase, packageId)
  if (!current) {
    throw new Error('Mac mini clip package not found.')
  }
  assertDryRunPayload(current.payload)
  if (current.tikTokStagingStatus === 'ready_for_manual_post') {
    throw new Error('Package is already Ready for manual Post.')
  }
  if (current.assetStatus !== 'attached' || !current.localAssetPath) {
    throw new Error('Stage in TikTok requires an attached local MP4 render.')
  }

  const now = (input.now ?? (() => new Date()))().toISOString()
  const { data, error } = await supabase
    .from('mac_mini_clip_packages')
    .update({
      package_status: 'ready',
      handoff_status: 'pending',
      tiktok_staging_status: 'requested',
      tiktok_staging_requested_at: now,
      tiktok_staging_requested_by: compact(input.requestedBy) || null,
      tiktok_staging_error: null,
      dry_run_error: null,
      updated_at: now,
    })
    .eq('id', packageId)
    .in('package_status', ['ready', 'fetched', 'dry_run_failed', 'dry_run_complete'])
    .select(PACKAGE_SELECT)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'TikTok staging request could not be recorded.')
  }
  return normalizePackageRow(data as unknown as MacMiniClipPackageRow)
}

export async function attachMacMiniLocalAsset(
  supabase: MacMiniDb,
  packageId: string,
  assetPath: string,
  input: { now?: () => Date; assetRoot?: string } = {},
): Promise<MacMiniClipPackage> {
  const { data: currentData, error: currentError } = await supabase
    .from('mac_mini_clip_packages')
    .select(PACKAGE_SELECT)
    .eq('id', packageId)
    .single()

  if (currentError || !currentData) {
    throw new Error(currentError?.message || 'Mac mini clip package not found.')
  }

  const current = currentData as unknown as MacMiniClipPackageRow
  assertDryRunPayload(current.package_payload)

  const validation = await validateMacMiniLocalAssetPath(assetPath, { assetRoot: input.assetRoot })
  const now = (input.now ?? (() => new Date()))().toISOString()

  if (!validation.ok) {
    const invalidPayload = payloadWithLocalAsset(current.package_payload, {
      localAssetPath: null,
      assetStatus: 'invalid',
      assetError: validation.error,
    })
    const { data, error } = await supabase
      .from('mac_mini_clip_packages')
      .update({
        local_asset_path: null,
        asset_status: 'invalid',
        asset_error: validation.error,
        asset_attached_at: null,
        package_payload: invalidPayload,
        updated_at: now,
      })
      .eq('id', packageId)
      .select(PACKAGE_SELECT)
      .single()

    if (error || !data) {
      throw new Error(error?.message || 'Invalid Mac mini local asset state could not be recorded.')
    }
    throw new Error(validation.error)
  }

  const payload = payloadWithLocalAsset(current.package_payload, {
    localAssetPath: validation.absolutePath,
    assetStatus: 'attached',
    assetError: null,
  })
  const { data, error } = await supabase
    .from('mac_mini_clip_packages')
    .update({
      local_asset_path: validation.absolutePath,
      asset_status: 'attached',
      asset_error: null,
      asset_attached_at: now,
      package_payload: payload,
      updated_at: now,
    })
    .eq('id', packageId)
    .select(PACKAGE_SELECT)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Mac mini local asset could not be attached.')
  }

  return normalizePackageRow(data as unknown as MacMiniClipPackageRow)
}

export async function recordMacMiniPackageDryRun(
  supabase: MacMiniDb,
  packageId: string,
  input: {
    status: MacMiniDryRunStatus
    workerId?: string | null
    result?: Record<string, unknown> | null
    error?: string | null
    now?: () => Date
  },
): Promise<MacMiniClipPackage> {
  const now = (input.now ?? (() => new Date()))().toISOString()
  const success = input.status === 'success'
  const stagingStatus = deriveTikTokStagingStatus({
    status: input.status,
    result: input.result,
    error: input.error,
  })
  const stagingUpdate = stagingStatus
    ? {
        tiktok_staging_status: stagingStatus,
        tiktok_staging_at: stagingStatus === 'ready_for_manual_post' ? now : null,
        tiktok_staging_error: stagingStatus === 'ready_for_manual_post' ? null : compact(input.error) || 'TikTok staging did not complete.',
      }
    : {}
  const { data, error } = await supabase
    .from('mac_mini_clip_packages')
    .update({
      package_status: success ? 'dry_run_complete' : 'dry_run_failed',
      handoff_status: success ? 'dry_run_succeeded' : 'dry_run_failed',
      worker_id: compact(input.workerId) || null,
      fetched_at: now,
      dry_run_at: now,
      dry_run_result: input.result ?? null,
      dry_run_error: success ? null : compact(input.error) || 'Mac mini dry-run failed.',
      ...stagingUpdate,
      updated_at: now,
    })
    .eq('id', packageId)
    .in('package_status', ['ready', 'fetched', 'dry_run_complete', 'dry_run_failed'])
    .select(PACKAGE_SELECT)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Mac mini dry-run status could not be recorded.')
  }

  return normalizePackageRow(data as unknown as MacMiniClipPackageRow)
}
