import type { SupabaseClient } from '@supabase/supabase-js'

import { editorialScore } from './source-system'
import {
  createOpusSupabaseClient,
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
}

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function compact(value: string | null | undefined, maxLength = 500): string {
  const clean = value?.replace(/\s+/g, ' ').trim() ?? ''
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 3).trim()}...`
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
      `id, ingested_video_id, title, score, score_breakdown, status, created_at,
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

export async function selectNextRBWomenAutopilotSource(
  db: AutopilotNextDb = createOpusSupabaseClient(),
): Promise<{ row: CandidateRow; rankScore: number; reason: string } | null> {
  const candidates = await loadEligibleCandidates(db)
  const eligible: Array<{ row: CandidateRow; rankScore: number; reason: string }> = []

  for (const row of candidates) {
    const video = firstJoined(row.ingested_videos)
    const source = firstJoined(video?.source_channels)
    if (!video?.video_url) continue
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
  return eligible[0] ?? null
}

export async function runRBWomenAutopilotNext(input: {
  dryRun?: boolean
  writeReport?: boolean
} = {}): Promise<RBWomenAutopilotNextReport> {
  const db = createOpusSupabaseClient()
  const selected = await selectNextRBWomenAutopilotSource(db)
  if (!selected) {
    throw new Error('No unprocessed RB Women scouting source is available.')
  }

  const video = firstJoined(selected.row.ingested_videos)
  const source = firstJoined(video?.source_channels)
  const report = await runRBWomenAutopilot({
    sourceId: selected.row.ingested_video_id,
    dryRun: input.dryRun,
    writeReport: input.writeReport,
    runId: `rb-women-autopilot-next-${selected.row.ingested_video_id}`,
  })

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
  }
}
