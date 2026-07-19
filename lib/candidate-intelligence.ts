import type { SupabaseClient } from '@supabase/supabase-js'

import {
  buildRBHQIntelligenceV1,
  type RBHQIntelligenceV1,
} from './intelligence-v1'

type CandidateIntelligenceDb = Pick<SupabaseClient, 'from'>

export type CandidateIntelligenceCandidate = {
  id: string
  target_channel_id?: string | null
  title: string
  summary?: string | null
  hook_text?: string | null
  caption?: string | null
  hashtags?: string[] | null
  score?: number | string | null
  score_breakdown?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

export type CandidateIntelligenceVideo = {
  id?: string | null
  title: string
  description?: string | null
  platform?: string | null
  video_url?: string | null
  published_at?: string | null
  duration_seconds?: number | string | null
  source_channels?: CandidateIntelligenceSource | CandidateIntelligenceSource[] | null
}

export type CandidateIntelligenceSource = {
  display_name?: string | null
  target_rbhq_channel_id?: string | null
}

export type CandidateIntelligenceJoinedCandidate = CandidateIntelligenceCandidate & {
  ingested_videos?: CandidateIntelligenceVideo | CandidateIntelligenceVideo[] | null
}

export type CandidateIntelligenceUpdate = {
  summary: string
  caption: string
  hashtags: string[]
  score: number
  score_breakdown: {
    model: 'rbhq_intelligence_v1'
    rankLabel: RBHQIntelligenceV1['rankLabel']
    urgency: RBHQIntelligenceV1['urgency']
    reasons: string[]
    whyNow: string
    operatorSummary: string
    suggestedCaption: string
    suggestedHashtags: string[]
    refreshedAt: string
  }
  updated_at: string
}

export type CandidateIntelligenceSyncResult<TCandidate extends CandidateIntelligenceCandidate = CandidateIntelligenceCandidate> = {
  candidateId: string
  candidate: TCandidate & CandidateIntelligenceUpdate
  intelligence: RBHQIntelligenceV1
  update: CandidateIntelligenceUpdate
  safety: {
    downloadsVideo: false
    rendersVideo: false
    uploadsVideo: false
    postsVideo: false
    callsMetricool: false
    callsN8n: false
    clicksFinalPost: false
  }
}

function compact(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function readNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function sourceTypeFor(video: CandidateIntelligenceVideo): string {
  const platform = compact(video.platform).toLowerCase()
  if (platform === 'youtube') return 'youtube_rss'
  return platform || 'youtube_rss'
}

export function buildCandidateIntelligenceV1Update(input: {
  candidate: CandidateIntelligenceCandidate
  video: CandidateIntelligenceVideo
  source?: CandidateIntelligenceSource | null
  now?: () => Date
}): { intelligence: RBHQIntelligenceV1; update: CandidateIntelligenceUpdate } {
  const source = input.source ?? null
  const intelligence = buildRBHQIntelligenceV1({
    id: input.candidate.id,
    channel_id: input.candidate.target_channel_id ?? source?.target_rbhq_channel_id ?? null,
    title: input.candidate.title || input.video.title,
    hook: input.candidate.hook_text,
    source_title: input.video.title,
    source_name: source?.display_name,
    source_type: sourceTypeFor(input.video),
    description: input.video.description,
    duration_seconds: readNumber(input.video.duration_seconds),
    published_at: input.video.published_at,
    created_at: input.candidate.created_at,
    updated_at: input.candidate.updated_at,
  })
  const refreshedAt = (input.now ?? (() => new Date()))().toISOString()

  return {
    intelligence,
    update: {
      summary: intelligence.operatorSummary,
      caption: intelligence.suggestedCaption,
      hashtags: intelligence.suggestedHashtags,
      score: intelligence.score,
      score_breakdown: {
        model: 'rbhq_intelligence_v1',
        rankLabel: intelligence.rankLabel,
        urgency: intelligence.urgency,
        reasons: intelligence.reasons,
        whyNow: intelligence.whyNow,
        operatorSummary: intelligence.operatorSummary,
        suggestedCaption: intelligence.suggestedCaption,
        suggestedHashtags: intelligence.suggestedHashtags,
        refreshedAt,
      },
      updated_at: refreshedAt,
    },
  }
}

export async function syncCandidateIntelligenceV1ForLoadedData<TCandidate extends CandidateIntelligenceCandidate>(
  supabase: CandidateIntelligenceDb,
  input: {
    candidate: TCandidate
    video: CandidateIntelligenceVideo
    source?: CandidateIntelligenceSource | null
    now?: () => Date
  },
): Promise<CandidateIntelligenceSyncResult<TCandidate>> {
  const built = buildCandidateIntelligenceV1Update(input)
  const { error } = await supabase
    .from('clip_candidates')
    .update(built.update)
    .eq('id', input.candidate.id)

  if (error) throw new Error(error.message)

  return {
    candidateId: input.candidate.id,
    candidate: {
      ...input.candidate,
      ...built.update,
    },
    intelligence: built.intelligence,
    update: built.update,
    safety: {
      downloadsVideo: false,
      rendersVideo: false,
      uploadsVideo: false,
      postsVideo: false,
      callsMetricool: false,
      callsN8n: false,
      clicksFinalPost: false,
    },
  }
}

export async function syncLoadedCandidateIntelligenceV1<TCandidate extends CandidateIntelligenceJoinedCandidate>(
  supabase: CandidateIntelligenceDb,
  candidate: TCandidate,
  input: { now?: () => Date } = {},
): Promise<CandidateIntelligenceSyncResult<TCandidate>> {
  const video = firstJoined(candidate.ingested_videos)
  if (!video) {
    throw new Error('Candidate Intelligence V1 refresh requires an ingested video.')
  }

  return syncCandidateIntelligenceV1ForLoadedData(supabase, {
    candidate,
    video,
    source: firstJoined(video.source_channels),
    now: input.now,
  })
}

export async function refreshCandidateIntelligenceV1(
  supabase: CandidateIntelligenceDb,
  candidateId: string,
  input: { now?: () => Date } = {},
): Promise<CandidateIntelligenceSyncResult<CandidateIntelligenceJoinedCandidate>> {
  const { data, error } = await supabase
    .from('clip_candidates')
    .select(
      `id, target_channel_id, title, summary, hook_text, caption, hashtags, score, score_breakdown, created_at, updated_at,
       ingested_videos!inner (
         id, title, description, platform, video_url, published_at, duration_seconds,
         source_channels ( display_name, target_rbhq_channel_id )
       )`,
    )
    .eq('id', candidateId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Clip candidate not found.')
  }

  return syncLoadedCandidateIntelligenceV1(
    supabase,
    data as unknown as CandidateIntelligenceJoinedCandidate,
    input,
  )
}
