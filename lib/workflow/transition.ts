import { supabaseAdminClient } from '../supabase-admin'

import { assertRbhqTransition } from './guards'
import type { RbhqActor, RbhqEntityType, RbhqWorkflowState } from './types'

const TABLE_BY_ENTITY: Record<RbhqEntityType, string> = {
  source_item: 'rbhq_source_items',
  clip: 'rbhq_clips',
  post: 'rbhq_posts',
}

export async function transitionRbhqState(input: {
  entityType: RbhqEntityType
  entityId: string
  fromState: RbhqWorkflowState
  toState: RbhqWorkflowState
  actor: RbhqActor
  reason: string
  metadata?: Record<string, unknown>
}) {
  assertRbhqTransition(input)

  const table = TABLE_BY_ENTITY[input.entityType]
  const now = new Date().toISOString()

  const { error: updateError } = await supabaseAdminClient
    .from(table)
    .update({ workflow_state: input.toState, updated_at: now })
    .eq('id', input.entityId)
    .eq('workflow_state', input.fromState)
    .select('id')
    .maybeSingle()

  if (updateError) {
    throw new Error(updateError.message)
  }

  if (!updateError) {
    const { data: current, error: currentError } = await supabaseAdminClient
      .from(table)
      .select('workflow_state')
      .eq('id', input.entityId)
      .maybeSingle()

    if (currentError) {
      throw new Error(currentError.message)
    }

    if (!current || current.workflow_state !== input.toState) {
      throw new Error(`RBHQ_TRANSITION_STALE:${input.fromState}->${input.toState}`)
    }
  }

  const { error: eventError } = await supabaseAdminClient
    .from('rbhq_workflow_events')
    .insert({
      entity_type: input.entityType,
      entity_id: input.entityId,
      from_state: input.fromState,
      to_state: input.toState,
      actor_type: input.actor.type,
      operator_id: input.actor.id ?? null,
      reason: input.reason,
      metadata: input.metadata ?? {},
    })

  if (eventError) {
    throw new Error(eventError.message)
  }

  if (
    input.actor.type === 'operator' ||
    input.actor.type === 'admin'
  ) {
    const action = resolveOperatorAction(input.entityType, input.toState)
    if (action) {
      const { error: actionError } = await supabaseAdminClient
        .from('rbhq_operator_actions')
        .insert({
          operator_id: input.actor.id ?? null,
          action,
          entity_type: input.entityType,
          entity_id: input.entityId,
          from_state: input.fromState,
          to_state: input.toState,
          reason: input.reason,
          metadata: input.metadata ?? {},
        })

      if (actionError) {
        throw new Error(actionError.message)
      }
    }
  }

  return { fromState: input.fromState, toState: input.toState }
}

function resolveOperatorAction(entityType: RbhqEntityType, toState: RbhqWorkflowState) {
  if (entityType === 'clip' && toState === 'CLIP_APPROVED') return 'approve_clip'
  if (entityType === 'clip' && toState === 'FAILED') return 'reject_clip'
  if (entityType === 'post' && toState === 'POST_APPROVED') return 'approve_post'
  if (entityType === 'post' && toState === 'FAILED') return 'reject_post'
  return null
}
