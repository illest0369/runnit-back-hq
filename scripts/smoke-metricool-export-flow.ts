const { randomUUID } = require('node:crypto') as typeof import('node:crypto')
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js')
const { config } = require('dotenv') as typeof import('dotenv')
const {
  markClipMetricoolPublished,
} = require('../lib/moderation-queue') as typeof import('../lib/moderation-queue')

config({ path: '.env.local', quiet: true })
config({ quiet: true })

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SMOKE_CHANNEL_ID =
  process.env.SMOKE_CHANNEL_ID?.trim() || 'a1000000-0000-0000-0000-000000000001'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function createSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

function isMetricoolHandoffSchemaError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('metricool_handoffs')
}

async function countMetricoolHandoffs(supabase: ReturnType<typeof createSupabase>, clipId: string) {
  const { count, error } = await supabase
    .from('metricool_handoffs')
    .select('id', { count: 'exact', head: true })
    .eq('clip_id', clipId)

  if (error) {
    if (isMetricoolHandoffSchemaError(error)) {
      return null
    }
    throw new Error(error.message)
  }

  return count ?? 0
}

async function insertSmokeClip(supabase: ReturnType<typeof createSupabase>, clipId: string) {
  const now = new Date().toISOString()
  let { error } = await supabase
    .from('clips')
    .insert({
      id: clipId,
      channel_id: SMOKE_CHANNEL_ID,
      external_id: `smoke-metricool-${clipId}`,
      title: 'Smoke test export clip',
      hook: 'Smoke test export hook',
      source_name: 'ESPN',
      source_type: 'youtube',
      thumbnail_url: 'https://images.example.com/smoke-test.jpg',
      video_url: 'https://cdn.example.com/generated/smoke-test.mp4',
      source_url: `https://www.youtube.com/watch?v=${clipId.replace(/-/g, '').slice(0, 11)}`,
      original_platform: 'youtube',
      duration_seconds: 27,
      ai_score: 90,
      virality_score: 88,
      hook_strength: 84,
      moderation_notes: [],
      risk_flags: [],
      status: 'approved',
      publish_status: 'metricool_ready_manual_export',
      approved_at: now,
      created_at: now,
      updated_at: now,
    })

  if (error?.message?.toLowerCase().includes('clips_publish_status_check')) {
    ;({ error } = await supabase
      .from('clips')
      .insert({
        id: clipId,
        channel_id: SMOKE_CHANNEL_ID,
        external_id: `smoke-metricool-${clipId}`,
        title: 'Smoke test export clip',
        hook: 'Smoke test export hook',
        source_name: 'ESPN',
        source_type: 'youtube',
        thumbnail_url: 'https://images.example.com/smoke-test.jpg',
        video_url: 'https://cdn.example.com/generated/smoke-test.mp4',
        source_url: `https://www.youtube.com/watch?v=${clipId.replace(/-/g, '').slice(0, 11)}`,
        original_platform: 'youtube',
        duration_seconds: 27,
        ai_score: 90,
        virality_score: 88,
        hook_strength: 84,
        moderation_notes: [],
        risk_flags: [],
        status: 'approved',
        publish_status: 'ready_for_manual_publish',
        approved_at: now,
        created_at: now,
        updated_at: now,
      }))
  }

  if (error) {
    throw new Error(error.message)
  }
}

async function main() {
  const supabase = createSupabase()
  const clipId = randomUUID()

  try {
    await insertSmokeClip(supabase, clipId)
    const beforeHandoffs = await countMetricoolHandoffs(supabase, clipId)
    const updated = await markClipMetricoolPublished(clipId, { channelIds: [SMOKE_CHANNEL_ID] })

    assert(updated, 'Smoke clip could not be marked exported.')
    assert(updated.status === 'approved', `Expected approved status, received ${updated.status}.`)
    assert(
      updated.publish_status === 'metricool_published' || updated.publish_status === 'manually_published',
      `Expected published export status, received ${updated.publish_status}.`,
    )
    assert(updated.manually_published_at, 'Expected manually_published_at to be set.')

    const { data: finalClip, error: finalError } = await supabase
      .from('clips')
      .select('id, status, publish_status, manually_published_at, updated_at')
      .eq('id', clipId)
      .maybeSingle()

    if (finalError) {
      throw new Error(finalError.message)
    }

    assert(finalClip, 'Smoke clip is missing after export update.')
    assert(
      finalClip.publish_status === 'metricool_published' || finalClip.publish_status === 'manually_published',
      `Final publish_status is ${finalClip.publish_status}, expected a published export state.`,
    )

    const afterHandoffs = await countMetricoolHandoffs(supabase, clipId)
    assert(
      beforeHandoffs === null || afterHandoffs === null || beforeHandoffs === afterHandoffs,
      `Expected no Metricool handoff side effects, but handoffs changed from ${beforeHandoffs} to ${afterHandoffs}.`,
    )

    console.log(JSON.stringify(
      {
        result: 'PASS',
        clipId,
        finalState: {
          status: finalClip.status,
          publishStatus: finalClip.publish_status,
          exportedAt: finalClip.manually_published_at,
          updatedAt: finalClip.updated_at,
        },
        handoffs: {
          before: beforeHandoffs,
          after: afterHandoffs,
          table: beforeHandoffs === null || afterHandoffs === null ? 'fallback' : 'available',
        },
      },
      null,
      2,
    ))
  } catch (error) {
    console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
    process.exitCode = 1
  } finally {
    await supabase.from('clips').delete().eq('id', clipId)
  }
}

void main()

export {}
