import type { RbhqActor, RbhqWorkflowState } from './types'

export const RBHQ_ALLOWED_TRANSITIONS: Record<RbhqWorkflowState, RbhqWorkflowState[]> = {
  INGESTED: ['SCORING', 'FAILED'],
  SCORING: ['READY_FOR_CLIP_APPROVAL', 'FAILED'],
  READY_FOR_CLIP_APPROVAL: ['CLIP_APPROVED', 'FAILED'],
  CLIP_APPROVED: ['READY_FOR_POST_APPROVAL', 'FAILED'],
  READY_FOR_POST_APPROVAL: ['POST_APPROVED', 'FAILED'],
  POST_APPROVED: ['POSTING', 'FAILED'],
  POSTING: ['POSTED', 'FAILED'],
  POSTED: ['ANALYTICS_SYNCED', 'FAILED'],
  ANALYTICS_SYNCED: [],
  FAILED: [],
}

const HUMAN_ONLY: Array<`${RbhqWorkflowState}->${RbhqWorkflowState}`> = [
  'READY_FOR_CLIP_APPROVAL->CLIP_APPROVED',
  'READY_FOR_POST_APPROVAL->POST_APPROVED',
]

export function assertRbhqTransition(input: {
  fromState: RbhqWorkflowState
  toState: RbhqWorkflowState
  actor: RbhqActor
}) {
  const transition = `${input.fromState}->${input.toState}` as const
  if (HUMAN_ONLY.includes(transition) && input.actor.type !== 'operator' && input.actor.type !== 'admin') {
    throw new Error('HUMAN_APPROVAL_REQUIRED')
  }

  if (!RBHQ_ALLOWED_TRANSITIONS[input.fromState].includes(input.toState)) {
    throw new Error(`INVALID_RBHQ_TRANSITION:${transition}`)
  }
}
