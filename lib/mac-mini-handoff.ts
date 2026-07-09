import { randomUUID } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { getChannelMeta } from './channel-meta'

export type MacMiniPackageStatus = 'ready' | 'fetched' | 'dry_run_complete' | 'dry_run_failed' | 'cancelled'
export type MacMiniHandoffStatus = 'pending' | 'fetched' | 'dry_run_succeeded' | 'dry_run_failed' | 'cancelled'
export type MacMiniDryRunStatus = 'success' | 'failure'

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
  tiktokDraft: {
    title: string
    hook: string
    caption: string
    hashtags: string[]
    sourceVideoUrl: string
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
  dryRunError: string | null
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
  status: string
  ingested_videos: JoinedIngestedVideo | JoinedIngestedVideo[] | null
}

type JoinedIngestedVideo = {
  id: string
  title: string
  video_url: string
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
  dry_run_error: string | null
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
  'dry_run_error',
  'created_at',
  'updated_at',
].join(', ')

const HIGH_PRIORITY_SCORE = 76

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
  return ['approved', 'approved_for_review', 'approved_for_handoff'].includes(status)
}

function isHighPriorityCandidate(candidate: ClipCandidateForPackage): boolean {
  const score = readNumber(candidate.score)
  const rankLabel = readBreakdownString(candidate.score_breakdown, 'rankLabel')
  const urgency = readBreakdownString(candidate.score_breakdown, 'urgency')
  return score >= HIGH_PRIORITY_SCORE || rankLabel === 'must_post' || rankLabel === 'strong' || urgency === 'post_now'
}

function assertPackageEligible(candidate: ClipCandidateForPackage): void {
  if (candidate.status === 'promoted' || candidate.status === 'rejected') {
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
    dryRunError: row.dry_run_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    tiktokDraft: {
      title: input.candidate.title || input.sourceTitle,
      hook: input.hook,
      caption: input.caption,
      hashtags: input.hashtags,
      sourceVideoUrl: input.sourceUrl,
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
      `id, ingested_video_id, target_channel_id, start_seconds, end_seconds, title, summary, hook_text, caption, hashtags, score, score_breakdown, status,
       ingested_videos!inner (
         id, title, video_url,
         source_channels ( display_name, target_rbhq_channel_id )
       )`,
    )
    .eq('id', candidateId)
    .single()

  if (candidateError || !candidateData) {
    throw new Error(candidateError?.message || 'Clip candidate not found.')
  }

  const candidate = candidateData as ClipCandidateForPackage
  assertPackageEligible(candidate)

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

  const now = (input.now ?? (() => new Date()))().toISOString()
  const packageId = input.packageId ?? randomUUID()
  const scoreBreakdown = candidate.score_breakdown ?? {}
  const sourceName = compact(source?.display_name) || 'RBHQ Source'
  const sourceTitle = compact(video.title || candidate.title)
  const sourceUrl = compact(video.video_url)
  const caption = compact(candidate.caption) || compact(candidate.title)
  const hashtags = stringArray(candidate.hashtags)
  const hook = compact(candidate.hook_text) || compact(candidate.title)
  const whyNow = readBreakdownString(scoreBreakdown, 'whyNow') || 'Approved candidate is queued for Mac mini dry-run review.'
  const operatorSummary = compact(candidate.summary) || readBreakdownString(scoreBreakdown, 'operatorSummary') || 'Mac mini dry-run package is ready for operator review.'
  const editNotes = [
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
  input: { limit?: number } = {},
): Promise<MacMiniClipPackage[]> {
  const { data, error } = await supabase
    .from('mac_mini_clip_packages')
    .select(PACKAGE_SELECT)
    .eq('package_status', 'ready')
    .eq('handoff_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(input.limit ?? 10)

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as MacMiniClipPackageRow[]).map(normalizePackageRow)
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
      updated_at: now,
    })
    .eq('id', packageId)
    .in('package_status', ['ready', 'fetched', 'dry_run_failed'])
    .select(PACKAGE_SELECT)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Mac mini dry-run status could not be recorded.')
  }

  return normalizePackageRow(data as unknown as MacMiniClipPackageRow)
}
