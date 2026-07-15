import {
  buildTikTokClipCandidates,
  readTimedSegments,
  type ScoutCandidateInsert,
  type ScoutSegment,
  type ScoutTranscriptRow,
  type ScoutVideoRow,
} from './tiktok-clip-scout'

export type AiMomentAnalystMode = 'off' | 'mock' | 'live'
export type AiMomentAnalystConfidence = 'high' | 'medium' | 'low'

export type AiMomentAnalystInput = {
  lane: string | null
  title: string
  source: {
    name: string | null
    type: string | null
    url: string | null
  }
  transcriptSegments: ScoutSegment[]
  viralSignals: Array<{
    key: string
    label: string
    score?: number | null
  }>
  deterministicCandidates: ScoutCandidateInsert[]
}

export type AiMomentAnalystMoment = {
  deterministicRank: number
  start_seconds: number
  end_seconds: number
  reason: string
  hook: string
  openingText: string
}

export type AiMomentAnalystOutput = {
  selectedMoment: AiMomentAnalystMoment | null
  alternateMoments: AiMomentAnalystMoment[]
  confidence: AiMomentAnalystConfidence
  reason: string
  hook: string
  openingText: string
  rejectHoldReason: string | null
}

export type AiMomentAnalystProvider = (input: AiMomentAnalystInput) => Promise<unknown> | unknown

export type OptionalAiMomentAnalystResult = {
  mode: AiMomentAnalystMode
  candidates: ScoutCandidateInsert[]
  analystInput: AiMomentAnalystInput
  analystOutput: AiMomentAnalystOutput | null
  fallbackUsed: boolean
  fallbackReason: string | null
  safety: {
    liveAiCalls: false
    uploadsVideo: false
    postsVideo: false
    triggersTikTokDryRun: false
    livePublish: false
  }
}

function compact(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(3))
}

function safeMode(value: string | null | undefined): AiMomentAnalystMode {
  if (value === 'mock' || value === 'live') return value
  return 'off'
}

export function resolveAiMomentAnalystMode(env: NodeJS.ProcessEnv = process.env): AiMomentAnalystMode {
  return safeMode(env.RBHQ_AI_MOMENT_ANALYST)
}

function validRange(start: number, end: number): boolean {
  return end > start && end - start >= 1 && end - start <= 60
}

function candidateMoment(candidate: ScoutCandidateInsert, rank: number): AiMomentAnalystMoment | null {
  const start = readNumber(candidate.start_seconds)
  const end = readNumber(candidate.end_seconds)
  if (start === null || end === null || !validRange(start, end)) return null
  return {
    deterministicRank: rank,
    start_seconds: roundSeconds(start),
    end_seconds: roundSeconds(end),
    reason: compact(candidate.score_breakdown.shortReason as string | null) || compact(candidate.summary) || 'Deterministic moment candidate.',
    hook: compact(candidate.hook_text) || compact(candidate.title),
    openingText: compact(candidate.hook_text) || compact(candidate.caption) || compact(candidate.title),
  }
}

function deterministicOutput(candidates: ScoutCandidateInsert[]): AiMomentAnalystOutput | null {
  const moments = candidates
    .map((candidate, index) => candidateMoment(candidate, index + 1))
    .filter((moment): moment is AiMomentAnalystMoment => Boolean(moment))
  const selected = moments[0] ?? null
  if (!selected) return null
  return {
    selectedMoment: selected,
    alternateMoments: moments.slice(1),
    confidence: 'medium',
    reason: selected.reason,
    hook: selected.hook,
    openingText: selected.openingText,
    rejectHoldReason: null,
  }
}

function validateAnalystOutput(value: unknown, candidates: ScoutCandidateInsert[]): AiMomentAnalystOutput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<AiMomentAnalystOutput>
  if (record.confidence !== 'high' && record.confidence !== 'medium' && record.confidence !== 'low') return null
  if (typeof record.reason !== 'string' || typeof record.hook !== 'string' || typeof record.openingText !== 'string') return null
  if (record.rejectHoldReason !== null && record.rejectHoldReason !== undefined && typeof record.rejectHoldReason !== 'string') return null
  if (!record.selectedMoment || typeof record.selectedMoment !== 'object') return null

  const selected = validateMoment(record.selectedMoment, candidates)
  if (!selected) return null
  const alternates = Array.isArray(record.alternateMoments)
    ? record.alternateMoments
      .map((moment) => validateMoment(moment, candidates))
      .filter((moment): moment is AiMomentAnalystMoment => Boolean(moment))
      .filter((moment) => moment.deterministicRank !== selected.deterministicRank)
    : []

  return {
    selectedMoment: selected,
    alternateMoments: alternates,
    confidence: record.confidence,
    reason: compact(record.reason),
    hook: compact(record.hook),
    openingText: compact(record.openingText),
    rejectHoldReason: record.rejectHoldReason ? compact(record.rejectHoldReason) : null,
  }
}

function validateMoment(value: unknown, candidates: ScoutCandidateInsert[]): AiMomentAnalystMoment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<AiMomentAnalystMoment>
  const rank = readNumber(record.deterministicRank)
  if (rank === null || !Number.isInteger(rank) || rank < 1 || rank > candidates.length) return null
  const candidate = candidates[rank - 1]
  const candidateStart = readNumber(candidate.start_seconds)
  const candidateEnd = readNumber(candidate.end_seconds)
  const start = readNumber(record.start_seconds)
  const end = readNumber(record.end_seconds)
  if (start === null || end === null || candidateStart === null || candidateEnd === null) return null
  if (!validRange(start, end) || !validRange(candidateStart, candidateEnd)) return null
  if (roundSeconds(start) !== roundSeconds(candidateStart) || roundSeconds(end) !== roundSeconds(candidateEnd)) return null
  if (typeof record.reason !== 'string' || typeof record.hook !== 'string' || typeof record.openingText !== 'string') return null
  return {
    deterministicRank: rank,
    start_seconds: roundSeconds(start),
    end_seconds: roundSeconds(end),
    reason: compact(record.reason),
    hook: compact(record.hook),
    openingText: compact(record.openingText),
  }
}

function applyAnalystOrder(
  candidates: ScoutCandidateInsert[],
  output: AiMomentAnalystOutput,
  mode: AiMomentAnalystMode,
): ScoutCandidateInsert[] {
  const selectedRank = output.selectedMoment?.deterministicRank
  if (!selectedRank) return candidates
  const orderedRanks = [
    selectedRank,
    ...output.alternateMoments.map((moment) => moment.deterministicRank),
    ...candidates.map((_, index) => index + 1),
  ]
  const seen = new Set<number>()
  const ordered = orderedRanks.flatMap((rank) => {
    if (seen.has(rank)) return []
    seen.add(rank)
    const candidate = candidates[rank - 1]
    return candidate ? [candidate] : []
  })

  return ordered.map((candidate, index) => {
    const start = readNumber(candidate.start_seconds)
    const end = readNumber(candidate.end_seconds)
    return {
      ...candidate,
      score_breakdown: {
        ...candidate.score_breakdown,
        role: index === 0 ? 'primary' : 'alternate',
        rank: index + 1,
        aiRecommendedStartSeconds: start === null ? null : roundSeconds(start),
        aiRecommendedEndSeconds: end === null ? null : roundSeconds(end),
        aiMomentAnalyst: {
          mode,
          selectedDeterministicRank: selectedRank,
          confidence: output.confidence,
          reason: output.reason,
          hook: output.hook,
          openingText: output.openingText,
          rejectHoldReason: output.rejectHoldReason,
          liveAiCalls: false,
        },
      },
      hook_text: index === 0 ? output.hook : candidate.hook_text,
      caption: index === 0 ? output.openingText : candidate.caption,
    }
  })
}

export function createMockAiMomentAnalystProvider(input: {
  selectedRank?: number
  invalid?: boolean
} = {}): AiMomentAnalystProvider {
  return (analystInput) => {
    if (input.invalid) {
      return {
        selectedMoment: {
          deterministicRank: 999,
          start_seconds: -1,
          end_seconds: -2,
          reason: 'Invalid mock output.',
          hook: '',
          openingText: '',
        },
        alternateMoments: [],
        confidence: 'high',
        reason: 'Invalid mock output.',
        hook: '',
        openingText: '',
        rejectHoldReason: null,
      }
    }

    const selectedRank = Math.min(
      Math.max(input.selectedRank ?? 1, 1),
      Math.max(analystInput.deterministicCandidates.length, 1),
    )
    const selected = candidateMoment(analystInput.deterministicCandidates[selectedRank - 1], selectedRank)
    const alternates = analystInput.deterministicCandidates
      .map((candidate, index) => candidateMoment(candidate, index + 1))
      .filter((moment): moment is AiMomentAnalystMoment => Boolean(moment))
      .filter((moment) => moment.deterministicRank !== selectedRank)
    return {
      selectedMoment: selected,
      alternateMoments: alternates,
      confidence: 'high',
      reason: selected ? `Mock AI promoted deterministic rank ${selectedRank}.` : 'Mock AI found no timed moment.',
      hook: selected?.hook ?? 'Mock AI hold',
      openingText: selected?.openingText ?? 'Mock AI hold',
      rejectHoldReason: selected ? null : 'no_timed_deterministic_candidate',
    } satisfies AiMomentAnalystOutput
  }
}

function buildAnalystInput(input: {
  video: ScoutVideoRow
  transcript: ScoutTranscriptRow | null
  lane?: string | null
  source?: { name?: string | null; type?: string | null; url?: string | null } | null
  viralSignals?: Array<{ key: string; label: string; score?: number | null }> | null
  deterministicCandidates: ScoutCandidateInsert[]
}): AiMomentAnalystInput {
  return {
    lane: input.lane ?? null,
    title: input.video.title,
    source: {
      name: input.source?.name ?? null,
      type: input.source?.type ?? null,
      url: input.source?.url ?? input.video.video_url ?? null,
    },
    transcriptSegments: input.transcript ? readTimedSegments(input.transcript.transcript_json) : [],
    viralSignals: input.viralSignals ?? [],
    deterministicCandidates: input.deterministicCandidates,
  }
}

function fallbackResult(input: {
  mode: AiMomentAnalystMode
  candidates: ScoutCandidateInsert[]
  analystInput: AiMomentAnalystInput
  analystOutput?: AiMomentAnalystOutput | null
  reason: string | null
}): OptionalAiMomentAnalystResult {
  return {
    mode: input.mode,
    candidates: input.candidates,
    analystInput: input.analystInput,
    analystOutput: input.analystOutput ?? deterministicOutput(input.candidates),
    fallbackUsed: true,
    fallbackReason: input.reason,
    safety: {
      liveAiCalls: false,
      uploadsVideo: false,
      postsVideo: false,
      triggersTikTokDryRun: false,
      livePublish: false,
    },
  }
}

export async function buildMomentCandidatesWithOptionalAiAnalyst(
  video: ScoutVideoRow,
  transcript: ScoutTranscriptRow | null,
  input: {
    targetChannelId?: string | null
    lane?: string | null
    source?: { name?: string | null; type?: string | null; url?: string | null } | null
    viralSignals?: Array<{ key: string; label: string; score?: number | null }> | null
    mode?: AiMomentAnalystMode
    provider?: AiMomentAnalystProvider | null
    now?: () => Date
  } = {},
): Promise<OptionalAiMomentAnalystResult> {
  const deterministicCandidates = buildTikTokClipCandidates(video, transcript, {
    targetChannelId: input.targetChannelId,
    now: input.now,
  })
  const mode = input.mode ?? resolveAiMomentAnalystMode()
  const analystInput = buildAnalystInput({
    video,
    transcript,
    lane: input.lane ?? input.targetChannelId ?? null,
    source: input.source,
    viralSignals: input.viralSignals,
    deterministicCandidates,
  })

  if (mode === 'off') {
    return fallbackResult({
      mode,
      candidates: deterministicCandidates,
      analystInput,
      reason: null,
    })
  }

  if (mode === 'live') {
    return fallbackResult({
      mode,
      candidates: deterministicCandidates,
      analystInput,
      reason: 'live_ai_moment_analyst_not_implemented',
    })
  }

  const provider = input.provider ?? createMockAiMomentAnalystProvider()
  const rawOutput = await provider(analystInput)
  const analystOutput = validateAnalystOutput(rawOutput, deterministicCandidates)
  if (!analystOutput) {
    return fallbackResult({
      mode,
      candidates: deterministicCandidates,
      analystInput,
      reason: 'invalid_ai_output_fallback_to_deterministic',
    })
  }

  return {
    mode,
    candidates: applyAnalystOrder(deterministicCandidates, analystOutput, mode),
    analystInput,
    analystOutput,
    fallbackUsed: false,
    fallbackReason: null,
    safety: {
      liveAiCalls: false,
      uploadsVideo: false,
      postsVideo: false,
      triggersTikTokDryRun: false,
      livePublish: false,
    },
  }
}
