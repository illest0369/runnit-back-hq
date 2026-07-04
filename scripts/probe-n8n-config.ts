import { config } from 'dotenv'

import {
  buildN8nPostPayload,
  getN8nConfigReport,
  sendClipToN8n,
} from '../lib/n8n-publisher'
import type { ExportableClip } from '../lib/export/types'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function buildProbeClip(): ExportableClip {
  const now = new Date().toISOString()
  return {
    id: 'n8n-probe-clip',
    channel_id: 'a1000000-0000-0000-0000-000000000001',
    title: 'RBHQ n8n probe',
    hook: 'RBHQ n8n probe payload',
    recommended_hook: 'RBHQ n8n probe payload',
    source_name: 'RBHQ Probe',
    sport: 'sports',
    league: null,
    video_url: 'https://cdn.example.com/rbhq-n8n-probe.mp4',
    thumbnail_url: null,
    moderation_notes: [],
    approved_at: now,
    updated_at: now,
    status: 'approved',
    publish_status: 'ready_for_manual_publish',
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (typeof value === 'undefined') {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

async function main() {
  const sendTest = process.argv.includes('--send-test')
  const report = getN8nConfigReport()
  const probeClip = buildProbeClip()
  const payload = buildN8nPostPayload(probeClip, { action: 'publish_now' })

  let handoff = null
  if (sendTest) {
    const originalTestMode = process.env.N8N_TEST_MODE
    process.env.N8N_TEST_MODE = 'true'
    try {
      handoff = await sendClipToN8n(probeClip, { action: 'publish_now' })
    } finally {
      restoreEnv('N8N_TEST_MODE', originalTestMode)
    }
  }

  console.log(JSON.stringify(
    {
      result: 'PASS',
      n8n: report,
      payloadPreview: {
        version: payload.version,
        publishAction: payload.publishAction,
        requestedPublishAction: payload.requestedPublishAction,
        channelId: payload.channelId,
        hasCaption: Boolean(payload.caption),
        hashtags: payload.hashtags.length,
        hasMediaUrl: Boolean(payload.media.url),
      },
      handoff: handoff
        ? {
            status: handoff.status,
            responseStatus: handoff.responseStatus,
            error: handoff.error,
          }
        : null,
      note: sendTest
        ? 'Send-test forced N8N_TEST_MODE=true and never requests live posting.'
        : 'No network request was made. Pass --send-test to send a dry-run payload when n8n is configured.',
    },
    null,
    2,
  ))
}

main().catch((error) => {
  console.error(JSON.stringify(
    {
      result: 'FAIL',
      error: error instanceof Error ? error.message : String(error),
    },
    null,
    2,
  ))
  process.exitCode = 1
})

export {}
