import type { SupabaseClient } from '@supabase/supabase-js'

type MomentSelectionDb = Pick<SupabaseClient, 'from'>

type CandidateForSelection = {
  id: string
  start_seconds: number | string | null
  end_seconds: number | string | null
  score?: number | string | null
  score_breakdown: Record<string, unknown> | null
}

export type OperatorMomentSelectionDecision = 'accepted' | 'overridden'

export type OperatorMomentSelectionResult = {
  candidateId: string
  decision: OperatorMomentSelectionDecision
  acceptedRecommendation: boolean
  aiRecommendedStartSeconds: number
  aiRecommendedEndSeconds: number
  selectedStartSeconds: number
  selectedEndSeconds: number
  selectedLengthSeconds: number
  selectedBy: string | null
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

function compact(value: string | null | undefined): string | null {
  return value?.replace(/\s+/g, ' ').trim() || null
}

function validateRange(start: number, end: number): void {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Selected moment requires valid start/end seconds.')
  }
  const duration = end - start
  if (duration < 1 || duration > 60) {
    throw new Error(`Selected moment must be 1-60 seconds; received ${roundSeconds(duration)}.`)
  }
}

export function buildOperatorMomentSelectionUpdate(input: {
  candidate: CandidateForSelection
  selectedStartSeconds?: number | null
  selectedEndSeconds?: number | null
  selectedBy?: string | null
  now?: () => Date
}) {
  const breakdown = input.candidate.score_breakdown ?? {}
  const fallbackManualStart = input.selectedStartSeconds ?? null
  const fallbackManualEnd = input.selectedEndSeconds ?? null
  const aiStart = readNumber(breakdown.aiRecommendedStartSeconds) ?? readNumber(input.candidate.start_seconds) ?? fallbackManualStart
  const aiEnd = readNumber(breakdown.aiRecommendedEndSeconds) ?? readNumber(input.candidate.end_seconds) ?? fallbackManualEnd
  if (aiStart === null || aiEnd === null) {
    throw new Error('Candidate does not have AI-recommended timestamps to select.')
  }
  validateRange(aiStart, aiEnd)

  const selectedStart = roundSeconds(input.selectedStartSeconds ?? aiStart)
  const selectedEnd = roundSeconds(input.selectedEndSeconds ?? aiEnd)
  validateRange(selectedStart, selectedEnd)

  const acceptedRecommendation = selectedStart === roundSeconds(aiStart) && selectedEnd === roundSeconds(aiEnd)
  const decision: OperatorMomentSelectionDecision = acceptedRecommendation ? 'accepted' : 'overridden'
  const selectedAt = (input.now ?? (() => new Date()))().toISOString()
  const selectedLength = roundSeconds(selectedEnd - selectedStart)

  return {
    update: {
      start_seconds: selectedStart,
      end_seconds: selectedEnd,
      suggested_clip_start_seconds: selectedStart,
      suggested_clip_end_seconds: selectedEnd,
      suggested_clip_length_seconds: selectedLength,
      status: 'approved_for_handoff',
      score_breakdown: {
        ...breakdown,
        momentRecommendation: {
          model: breakdown.model ?? null,
          recommendationSetId: breakdown.recommendationSetId ?? null,
          role: breakdown.role ?? null,
          rank: breakdown.rank ?? null,
          aiRecommendedStartSeconds: roundSeconds(aiStart),
          aiRecommendedEndSeconds: roundSeconds(aiEnd),
          score: readNumber(input.candidate.score) ?? readNumber(breakdown.score) ?? null,
          momentType: breakdown.momentType ?? null,
          contextBurden: breakdown.contextBurden ?? null,
          shortReason: breakdown.shortReason ?? null,
        },
        operatorSelection: {
          decision,
          acceptedRecommendation,
          selectedStartSeconds: selectedStart,
          selectedEndSeconds: selectedEnd,
          selectedLengthSeconds: selectedLength,
          selectedAt,
          selectedBy: compact(input.selectedBy),
          aiRecommendedStartSeconds: roundSeconds(aiStart),
          aiRecommendedEndSeconds: roundSeconds(aiEnd),
        },
      },
      updated_at: selectedAt,
    },
    result: {
      decision,
      acceptedRecommendation,
      aiRecommendedStartSeconds: roundSeconds(aiStart),
      aiRecommendedEndSeconds: roundSeconds(aiEnd),
      selectedStartSeconds: selectedStart,
      selectedEndSeconds: selectedEnd,
      selectedLengthSeconds: selectedLength,
      selectedBy: compact(input.selectedBy),
    },
  }
}

export async function selectOperatorMoment(
  supabase: MomentSelectionDb,
  candidateId: string,
  input: {
    selectedStartSeconds?: number | null
    selectedEndSeconds?: number | null
    selectedBy?: string | null
    now?: () => Date
  } = {},
): Promise<OperatorMomentSelectionResult> {
  const { data, error } = await supabase
    .from('clip_candidates')
    .select('id, start_seconds, end_seconds, score, score_breakdown')
    .eq('id', candidateId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Clip candidate not found.')
  }

  const { update, result } = buildOperatorMomentSelectionUpdate({
    candidate: data as unknown as CandidateForSelection,
    selectedStartSeconds: input.selectedStartSeconds,
    selectedEndSeconds: input.selectedEndSeconds,
    selectedBy: input.selectedBy,
    now: input.now,
  })

  const { error: updateError } = await supabase
    .from('clip_candidates')
    .update(update)
    .eq('id', candidateId)

  if (updateError) throw new Error(updateError.message)

  return {
    candidateId,
    ...result,
  }
}
