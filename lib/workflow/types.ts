export const RBHQ_WORKFLOW_STATES = [
  'INGESTED',
  'SCORING',
  'READY_FOR_CLIP_APPROVAL',
  'CLIP_APPROVED',
  'READY_FOR_POST_APPROVAL',
  'POST_APPROVED',
  'POSTING',
  'POSTED',
  'ANALYTICS_SYNCED',
  'FAILED',
] as const

export type RbhqWorkflowState = (typeof RBHQ_WORKFLOW_STATES)[number]
export type RbhqEntityType = 'source_item' | 'clip' | 'post'
export type RbhqActorType = 'system' | 'worker' | 'operator' | 'admin'

export type RbhqActor = {
  type: RbhqActorType
  id?: string | null
}

export function isRbhqWorkflowState(value: string): value is RbhqWorkflowState {
  return RBHQ_WORKFLOW_STATES.includes(value as RbhqWorkflowState)
}
