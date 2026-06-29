import { supabaseAdminClient } from './supabase-admin'

export type AuditLogInput = {
  clip_id?: string | null
  post_id?: string | null
  stage: string
  actor: string
  decision?: string | null
  from_state?: string | null
  to_state?: string | null
  reason?: string | null
}

export async function writeAuditLog(input: AuditLogInput) {
  const payload = {
    id: crypto.randomUUID(),
    clip_id: input.clip_id ?? null,
    post_id: input.post_id ?? input.clip_id ?? null,
    stage: input.stage,
    actor: input.actor,
    decision: input.decision ?? null,
    from_state: input.from_state ?? null,
    to_state: input.to_state ?? null,
    reason: input.reason ?? null,
    timestamp: new Date().toISOString(),
  }

  try {
    const { error } = await supabaseAdminClient.from('war_room_audit_logs').insert(payload)
    if (error) {
      console.error('[war-room-audit] insert failed', { error: error.message, payload })
    }
  } catch (error) {
    console.error('[war-room-audit] unavailable', {
      error: error instanceof Error ? error.message : String(error),
      payload,
    })
  }
}
