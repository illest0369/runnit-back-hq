import { writeAuditLog } from './audit-log'

export type FinalJudgeDecision = 'APPROVE' | 'REJECT' | 'REVISE'

const FINAL_JUDGE_DECISIONS = new Set<FinalJudgeDecision>(['APPROVE', 'REJECT', 'REVISE'])

export async function parseFinalJudgeDecision(input: {
  value: unknown
  clipId?: string | null
  postId?: string | null
  actor?: string
}): Promise<FinalJudgeDecision> {
  if (typeof input.value !== 'string') {
    await logFailure(input, 'Decision value must be a string.')
    throw new Error('INVALID_FINAL_JUDGE_DECISION')
  }

  const trimmed = input.value.trim()
  const normalized = trimmed.toUpperCase()
  const normalizedFromLowercase = trimmed !== normalized && trimmed.toLowerCase() === trimmed

  if (normalizedFromLowercase && FINAL_JUDGE_DECISIONS.has(normalized as FinalJudgeDecision)) {
    await writeAuditLog({
      clip_id: input.clipId ?? null,
      post_id: input.postId ?? input.clipId ?? null,
      stage: 'FINAL_JUDGE',
      actor: input.actor ?? 'ai',
      decision: normalized,
      reason: 'NORMALIZED_LOWERCASE_DECISION',
    })
    return normalized as FinalJudgeDecision
  }

  if (trimmed !== normalized || !FINAL_JUDGE_DECISIONS.has(normalized as FinalJudgeDecision)) {
    await logFailure(input, `Invalid final judge decision: ${trimmed}`)
    throw new Error('INVALID_FINAL_JUDGE_DECISION')
  }

  await writeAuditLog({
    clip_id: input.clipId ?? null,
    post_id: input.postId ?? input.clipId ?? null,
    stage: 'FINAL_JUDGE',
    actor: input.actor ?? 'ai',
    decision: normalized,
  })

  return normalized as FinalJudgeDecision
}

async function logFailure(input: {
  clipId?: string | null
  postId?: string | null
  actor?: string
}, reason: string) {
  await writeAuditLog({
    clip_id: input.clipId ?? null,
    post_id: input.postId ?? input.clipId ?? null,
    stage: 'FINAL_JUDGE',
    actor: input.actor ?? 'ai',
    decision: 'FAILED_PARSE',
    reason,
  })
}
