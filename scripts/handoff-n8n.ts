import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import {
  getClipById,
  isMetricoolExportReadyStatus,
  updateClipAutomationStatus,
} from '../lib/moderation-queue'
import { getN8nConfigReport, sendClipToN8n } from '../lib/n8n-publisher'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value?.trim() || null
}

function createSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(supabaseUrl, serviceKey)
}

async function main() {
  const clipId = readArg('--clip-id') ?? process.env.CLIP_ID?.trim()
  if (!clipId) {
    throw new Error('Missing clip id. Use --clip-id <approved_rendered_clip_id>.')
  }

  const configReport = getN8nConfigReport()
  if (configReport.provider !== 'n8n' || !configReport.configured || !configReport.testMode) {
    throw new Error('n8n handoff requires PUBLISH_PROVIDER=n8n, N8N_WEBHOOK_URL, and N8N_TEST_MODE=true.')
  }

  createSupabase()
  const current = await getClipById(clipId, { includeMetricoolHandoffStatus: false })
  if (!current) {
    throw new Error('Clip not found.')
  }
  if (current.status !== 'approved' || !isMetricoolExportReadyStatus(current.publish_status)) {
    throw new Error(`Clip must be approved and automation-ready before n8n handoff; found ${current.status}/${current.publish_status}.`)
  }

  const n8n = await sendClipToN8n(current, { action: 'publish_now' })
  const targetPublishStatus =
    n8n.automationStatus === 'automation_queued'
      ? 'automation_queued'
      : n8n.status === 'sent_to_n8n'
      ? 'sent_to_n8n'
      : n8n.status === 'n8n_failed'
        ? 'automation_failed'
        : null

  const updated = targetPublishStatus
    ? await updateClipAutomationStatus(clipId, { publishStatus: targetPublishStatus })
    : current

  if (!updated) {
    throw new Error('n8n handoff status could not be persisted safely.')
  }

  const ok = n8n.status !== 'n8n_failed' && (n8n.status === 'n8n_test_mode' || n8n.automationStatus === 'automation_queued')
  if (!ok) {
    throw new Error(n8n.error || `n8n handoff failed with status ${n8n.status}.`)
  }

  console.log(JSON.stringify(
    {
      result: 'PASS',
      handoff: {
        clipId,
        n8nStatus: n8n.status,
        automationStatus: n8n.automationStatus,
        responseStatus: n8n.responseStatus,
        responseBody: n8n.responseBody,
        payload: n8n.payload,
      },
      finalClip: {
        id: updated.id,
        status: updated.status,
        publishStatus: updated.publish_status,
        approvedAt: updated.approved_at,
        manuallyPublishedAt: updated.manually_published_at,
        videoUrl: updated.video_url,
        riskFlags: updated.risk_flags,
      },
    },
    null,
    2,
  ))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
