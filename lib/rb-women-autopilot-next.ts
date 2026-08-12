import type { SupabaseClient } from '@supabase/supabase-js'

import { editorialScore } from './source-system'
import {
  createOpusSupabaseClient,
  YouTubeAcquisitionError,
  type GeminiGenerationTelemetry,
} from './rb-women-opus-pipeline'
import { runRBWomenAutopilot, type RBWomenAutopilotReport } from './rb-women-autopilot'
import { RB_WOMEN_CHANNEL_ID } from './rb-women-source-config'

type AutopilotNextDb = SupabaseClient

type CandidateRow = {
  id: string
  ingested_video_id: string
  title: string
  score: number | null
  score_breakdown: Record<string, unknown> | null
  edit_notes: string[] | null
  status: string
  created_at: string | null
  ingested_videos: {
    id: string
    video_url: string
    title: string | null
    published_at: string | null
    source_channels: {
      id: string
      channel_key: string | null
      display_name: string
      enabled: boolean | null
      target_rbhq_channel_id: string | null
    } | Array<{
      id: string
      channel_key: string | null
      display_name: string
      enabled: boolean | null
      target_rbhq_channel_id: string | null
    }> | null
  } | Array<{
    id: string
    video_url: string
    title: string | null
    published_at: string | null
    source_channels: {
      id: string
      channel_key: string | null
      display_name: string
      enabled: boolean | null
      target_rbhq_channel_id: string | null
    } | Array<{
      id: string
      channel_key: string | null
      display_name: string
      enabled: boolean | null
      target_rbhq_channel_id: string | null
    }> | null
  }> | null
}

export const MAX_AUTOPILOT_NEXT_SOURCE_ATTEMPTS = 3
const DEFAULT_GEMINI_ANALYSIS_RETRY_AFTER_MS = 15 * 60_000

export function boundedAutopilotNextSourceAttempts<T>(sources: T[], limit = MAX_AUTOPILOT_NEXT_SOURCE_ATTEMPTS): T[] {
  return sources.slice(0, Math.max(0, limit))
}

export type RBWomenAutopilotNextReport = RBWomenAutopilotReport & {
  selectedSource: {
    candidateId: string
    videoId: string
    title: string
    sourceName: string
    sourceChannelKey: string | null
    sourceRankScore: number
    reason: string
  } | null
  skippedSources?: Array<{
    candidateId: string
    videoId: string
    title: string
    downloadStatus: string
    reason: string
  }>
  transientAnalysis?: {
    retryAfter: string
  } | null
}

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function compact(value: string | null | undefined, maxLength = 500): string {
  const clean = value?.replace(/\s+/g, ' ').trim() ?? ''
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 3).trim()}...`
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function scoreBreakdownRecord(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' ? value : {}
}

function analysisRetryAfter(row: CandidateRow): number | null {
  const value = scoreBreakdownRecord(row.score_breakdown).analysis_retry_after
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function isGeminiTransientReport(report: Pick<RBWomenAutopilotReport, 'gemini'>): boolean {
  return report.gemini?.finalStatus === 'transient_failed'
}

function sourceRankScore(row: CandidateRow): number {
  const video = firstJoined(row.ingested_videos)
  const source = firstJoined(video?.source_channels)
  const base = Number(row.score ?? 0)
  return editorialScore({
    title: row.title,
    sourceName: source?.display_name,
    channelId: RB_WOMEN_CHANNEL_ID,
    sourceScore: base,
    publishedAt: video?.published_at,
  })
}

async function alreadyAutopiloted(db: AutopilotNextDb, videoId: string): Promise<boolean> {
  const { data, error } = await db
    .from('clip_candidates')
    .select('id')
    .eq('target_channel_id', RB_WOMEN_CHANNEL_ID)
    .contains('edit_notes', [`autopilot_source_video:${videoId}`])
    .limit(1)

  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

async function loadEligibleCandidates(db: AutopilotNextDb): Promise<CandidateRow[]> {
  const { data, error } = await db
    .from('clip_candidates')
    .select(
      `id, ingested_video_id, title, score, score_breakdown, edit_notes, status, created_at,
       ingested_videos!inner (
         id, video_url, title, published_at,
         source_channels!inner ( id, channel_key, display_name, enabled, target_rbhq_channel_id )
       )`,
    )
    .eq('target_channel_id', RB_WOMEN_CHANNEL_ID)
    .eq('status', 'candidate')
    .order('score', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as CandidateRow[]
}

export async function selectRankedRBWomenAutopilotSources(
  db: AutopilotNextDb = createOpusSupabaseClient(),
): Promise<Array<{ row: CandidateRow; rankScore: number; reason: string }>> {
  const candidates = await loadEligibleCandidates(db)
  const eligible: Array<{ row: CandidateRow; rankScore: number; reason: string }> = []

  for (const row of candidates) {
    const video = firstJoined(row.ingested_videos)
    const source = firstJoined(video?.source_channels)
    if (!video?.video_url) continue
    const retryAfter = analysisRetryAfter(row)
    if (retryAfter && retryAfter > Date.now()) continue
    if (source?.target_rbhq_channel_id !== RB_WOMEN_CHANNEL_ID || source.enabled === false) continue
    if (await alreadyAutopiloted(db, row.ingested_video_id)) continue
    const score = sourceRankScore(row)
    eligible.push({
      row,
      rankScore: score,
      reason: compact(`Highest eligible RB Women scouting candidate from ${source?.display_name ?? 'unknown source'} at ${score}/100; status ${row.status}.`),
    })
  }

  eligible.sort((left, right) =>
    right.rankScore - left.rankScore ||
    Date.parse(firstJoined(right.row.ingested_videos)?.published_at ?? right.row.created_at ?? '') -
      Date.parse(firstJoined(left.row.ingested_videos)?.published_at ?? left.row.created_at ?? ''),
  )
  return eligible
}

export async function selectNextRBWomenAutopilotSource(
  db: AutopilotNextDb = createOpusSupabaseClient(),
): Promise<{ row: CandidateRow; rankScore: number; reason: string } | null> {
  return (await selectRankedRBWomenAutopilotSources(db))[0] ?? null
}

async function recordAcquisitionFailure(
  db: AutopilotNextDb,
  input: {
    row: CandidateRow
    error: YouTubeAcquisitionError
  },
) {
  const now = new Date().toISOString()
  const existingBreakdown = input.row.score_breakdown ?? {}
  const nextBreakdown = {
    ...existingBreakdown,
    download_status: input.error.downloadStatus,
    acquisition: {
      download_status: input.error.downloadStatus,
      failed_at: now,
      auth_retry_attempted: input.error.authRetryAttempted,
      auth_retry_succeeded: input.error.authRetrySucceeded,
      reason: input.error.message,
    },
  }
  const existingNotes = Array.isArray(input.row.edit_notes) ? input.row.edit_notes : []
  const { error } = await db
    .from('clip_candidates')
    .update({
      status: 'acquisition_failed',
      score_breakdown: nextBreakdown,
      edit_notes: [
        ...existingNotes,
        `download_status:${input.error.downloadStatus}`,
        `acquisition_failed_at:${now}`,
      ],
      updated_at: now,
    })
    .eq('id', input.row.id)
    .eq('status', 'candidate')

  if (error) throw new Error(error.message)
}

async function recordGeminiTransientFailure(
  db: AutopilotNextDb,
  input: {
    row: CandidateRow
    gemini: GeminiGenerationTelemetry
  },
): Promise<string> {
  const now = new Date().toISOString()
  const retryAfter = new Date(Date.now() + readPositiveIntegerEnv('GEMINI_ANALYSIS_RETRY_AFTER_MS', DEFAULT_GEMINI_ANALYSIS_RETRY_AFTER_MS)).toISOString()
  const existingBreakdown = scoreBreakdownRecord(input.row.score_breakdown)
  const nextBreakdown = {
    ...existingBreakdown,
    analysis_status: 'transient_failed',
    analysis_retry_after: retryAfter,
    gemini: {
      primaryModel: input.gemini.primaryModel,
      fallbackModel: input.gemini.fallbackModel,
      modelUsed: input.gemini.modelUsed,
      attempts: input.gemini.attempts,
      transientFailures: input.gemini.transientFailures,
      fallbackUsed: input.gemini.fallbackUsed,
      finalStatus: input.gemini.finalStatus,
      failed_at: now,
    },
  }
  const existingNotes = Array.isArray(input.row.edit_notes) ? input.row.edit_notes : []
  const { error } = await db
    .from('clip_candidates')
    .update({
      score_breakdown: nextBreakdown,
      edit_notes: [
        ...existingNotes,
        'analysis_status:transient_failed',
        `analysis_retry_after:${retryAfter}`,
      ],
      updated_at: now,
    })
    .eq('id', input.row.id)
    .eq('status', 'candidate')

  if (error) throw new Error(error.message)
  return retryAfter
}

export async function runRBWomenAutopilotNext(input: {
  dryRun?: boolean
  writeReport?: boolean
} = {}): Promise<RBWomenAutopilotNextReport> {
  const db = createOpusSupabaseClient()
  const rankedSources = boundedAutopilotNextSourceAttempts(await selectRankedRBWomenAutopilotSources(db))
  if (rankedSources.length === 0) {
    throw new Error('No unprocessed RB Women scouting source is available.')
  }

  const skippedSources: RBWomenAutopilotNextReport['skippedSources'] = []
  let lastAcquisitionError: YouTubeAcquisitionError | null = null

  for (const selected of rankedSources) {
    const video = firstJoined(selected.row.ingested_videos)
    const source = firstJoined(video?.source_channels)
    try {
      const report = await runRBWomenAutopilot({
        sourceId: selected.row.ingested_video_id,
        dryRun: input.dryRun,
        writeReport: input.writeReport,
        runId: `rb-women-autopilot-next-${selected.row.ingested_video_id}`,
      })
      const transientRetryAfter = isGeminiTransientReport(report)
        ? await recordGeminiTransientFailure(db, { row: selected.row, gemini: report.gemini as GeminiGenerationTelemetry })
        : null

      return {
        ...report,
        selectedSource: {
          candidateId: selected.row.id,
          videoId: selected.row.ingested_video_id,
          title: selected.row.title,
          sourceName: source?.display_name ?? '',
          sourceChannelKey: source?.channel_key ?? null,
          sourceRankScore: selected.rankScore,
          reason: selected.reason,
        },
        skippedSources,
        transientAnalysis: transientRetryAfter ? { retryAfter: transientRetryAfter } : null,
      }
    } catch (error) {
      if (!(error instanceof YouTubeAcquisitionError)) {
        throw error
      }
      lastAcquisitionError = error
      await recordAcquisitionFailure(db, { row: selected.row, error })
      skippedSources.push({
        candidateId: selected.row.id,
        videoId: selected.row.ingested_video_id,
        title: selected.row.title,
        downloadStatus: error.downloadStatus,
        reason: error.message,
      })
    }
  }

  throw new Error(`No RB Women source could be acquired after ${rankedSources.length} ranked attempts. Last status: ${lastAcquisitionError?.downloadStatus ?? 'unknown'}.`)
}
