import { writeAuditLog } from './audit-log'
import { supabaseAdminClient } from './supabase-admin'

export type ClipState =
  | 'SOURCED'
  | 'SELECTED'
  | 'GENERATED'
  | 'GUARDED'
  | 'REVIEWED'
  | 'AI_DECISION'
  | 'APPROVED_BY_HUMAN'
  | 'EXECUTED'
  | 'REJECTED'
  | 'FAILED'
  | 'REVISE'

export type StateActor = {
  id: string
  type: 'system' | 'ai' | 'human' | 'admin' | 'worker'
}

export const allowedTransitions: Record<ClipState, ClipState[]> = {
  SOURCED: ['SELECTED', 'REJECTED'],
  SELECTED: ['GENERATED', 'REJECTED'],
  GENERATED: ['GUARDED', 'FAILED'],
  GUARDED: ['REVIEWED', 'FAILED'],
  REVIEWED: ['AI_DECISION', 'REJECTED'],
  AI_DECISION: ['APPROVED_BY_HUMAN', 'REVISE', 'REJECTED'],
  APPROVED_BY_HUMAN: ['EXECUTED', 'FAILED'],
  EXECUTED: [],
  REJECTED: [],
  FAILED: [],
  REVISE: ['SELECTED', 'REJECTED'],
}

const legacyStateMap: Record<string, ClipState> = {
  queued: 'AI_DECISION',
  needs_review: 'AI_DECISION',
  approved: 'APPROVED_BY_HUMAN',
  ready_to_post: 'APPROVED_BY_HUMAN',
  sent_to_publish: 'EXECUTED',
  sent_to_buffer: 'EXECUTED',
  posted: 'EXECUTED',
  processed: 'EXECUTED',
  failed: 'FAILED',
  rejected: 'REJECTED',
  generated: 'GENERATED',
}

export function normalizeClipState(value: string | null | undefined): ClipState {
  const raw = value?.trim()
  if (!raw) {
    throw new Error('MISSING_CLIP_STATE')
  }

  const upper = raw.toUpperCase()
  if (isClipState(upper)) {
    return upper
  }

  const legacy = legacyStateMap[raw.toLowerCase()]
  if (legacy) {
    return legacy
  }

  throw new Error(`UNKNOWN_CLIP_STATE:${raw}`)
}

export function assertValidTransition(currentState: string, nextState: string, actor?: StateActor) {
  const current = normalizeClipState(currentState)
  const next = normalizeClipState(nextState)

  if (next === 'APPROVED_BY_HUMAN' && actor?.type !== 'human' && actor?.type !== 'admin') {
    throw new Error('AI_OR_SYSTEM_CANNOT_APPROVE')
  }

  if (next === 'EXECUTED' && current !== 'APPROVED_BY_HUMAN') {
    throw new Error('EXECUTION_REQUIRES_HUMAN_APPROVAL')
  }

  if (current === 'FAILED' && next === 'SOURCED') {
    if (actor?.type !== 'admin') {
      throw new Error('FAILED_RESET_REQUIRES_ADMIN')
    }
    return
  }

  if (current === 'REJECTED' && next === 'SOURCED') {
    if (actor?.type !== 'admin') {
      throw new Error('REJECTED_RESET_REQUIRES_ADMIN')
    }
    return
  }

  if (!allowedTransitions[current].includes(next)) {
    throw new Error(`INVALID_STATE_TRANSITION:${current}->${next}`)
  }
}

export async function transitionClipState(input: {
  clipId: string
  currentState: string
  nextState: ClipState
  actor: StateActor
  reason: string
}) {
  const fromState = normalizeClipState(input.currentState)
  const toState = normalizeClipState(input.nextState)

  try {
    assertValidTransition(fromState, toState, input.actor)
  } catch (error) {
    await writeAuditLog({
      clip_id: input.clipId,
      post_id: input.clipId,
      stage: 'STATE_TRANSITION',
      actor: `${input.actor.type}:${input.actor.id}`,
      decision: 'BLOCKED',
      from_state: fromState,
      to_state: toState,
      reason: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: toState,
    updated_at: now,
  }

  if (toState === 'APPROVED_BY_HUMAN') {
    patch.review_status = 'approved'
    patch.approved_by_user_id = input.actor.id
    patch.approved_by = input.actor.id
    patch.approved_at = now
  } else if (toState === 'REJECTED') {
    patch.review_status = 'rejected'
  }

  let { data: post, error: postError } = await supabaseAdminClient
    .from('posts')
    .update(patch)
    .eq('id', input.clipId)
    .select('id, clip_id')
    .maybeSingle()

  if (postError?.message.includes('approved_by_user_id')) {
    const legacyPatch = { ...patch }
    delete legacyPatch.approved_by_user_id
    ;({ data: post, error: postError } = await supabaseAdminClient
      .from('posts')
      .update(legacyPatch)
      .eq('id', input.clipId)
      .select('id, clip_id')
      .maybeSingle())
  }

  if (postError?.message.includes('approved_by') || postError?.message.includes('approved_at')) {
    const oldestPatch = { ...patch }
    delete oldestPatch.approved_by_user_id
    delete oldestPatch.approved_by
    delete oldestPatch.approved_at
    ;({ data: post, error: postError } = await supabaseAdminClient
      .from('posts')
      .update(oldestPatch)
      .eq('id', input.clipId)
      .select('id, clip_id')
      .maybeSingle())
  }

  if (postError) {
    throw new Error(postError.message)
  }

  if (post?.clip_id) {
    const queuePatch: Record<string, unknown> = {
      status: toState,
      updated_at: now,
    }
    if (toState === 'APPROVED_BY_HUMAN') {
      queuePatch.approved_by_user_id = input.actor.id
    }
    let { error: queueUpdateError } = await supabaseAdminClient
      .from('queue_jobs')
      .update(queuePatch)
      .eq('id', post.clip_id)
    if (queueUpdateError?.message.includes('approved_by_user_id')) {
      delete queuePatch.approved_by_user_id
      ;({ error: queueUpdateError } = await supabaseAdminClient
        .from('queue_jobs')
        .update(queuePatch)
        .eq('id', post.clip_id))
    }
  } else if (!post) {
    const queuePatch: Record<string, unknown> = {
      status: toState,
      updated_at: now,
    }
    if (toState === 'APPROVED_BY_HUMAN') {
      queuePatch.approved_by_user_id = input.actor.id
    }
    let { error: queueError } = await supabaseAdminClient
      .from('queue_jobs')
      .update(queuePatch)
      .eq('id', input.clipId)

    if (queueError?.message.includes('approved_by_user_id')) {
      delete queuePatch.approved_by_user_id
      ;({ error: queueError } = await supabaseAdminClient
        .from('queue_jobs')
        .update(queuePatch)
        .eq('id', input.clipId))
    }

    if (queueError) {
      throw new Error(queueError.message)
    }
  }

  await writeAuditLog({
    clip_id: input.clipId,
    post_id: input.clipId,
    stage: 'STATE_TRANSITION',
    actor: `${input.actor.type}:${input.actor.id}`,
    decision: 'TRANSITIONED',
    from_state: fromState,
    to_state: toState,
    reason: input.reason,
  })

  return { fromState, toState }
}

function isClipState(value: string): value is ClipState {
  return [
    'SOURCED',
    'SELECTED',
    'GENERATED',
    'GUARDED',
    'REVIEWED',
    'AI_DECISION',
    'APPROVED_BY_HUMAN',
    'EXECUTED',
    'REJECTED',
    'FAILED',
    'REVISE',
  ].includes(value)
}
