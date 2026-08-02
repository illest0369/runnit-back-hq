import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

import { buildPublishExportPackage } from '../lib/export/build-export'
import { getClipById } from '../lib/moderation-queue'
import { getTikTokVerticalReadiness } from '../lib/tiktok-analyzer'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

type MetricoolHandoffRow = {
  id: string
  status: string | null
  publish_status: string | null
  error: string | null
  response_status: number | null
  response_body: unknown
  request_payload: unknown
  created_at: string | null
}

type ClipAssetRow = {
  id: string
  status: string | null
  publish_status: string | null
  asset_storage_provider: string | null
  asset_public_url: string | null
  moderation_notes: unknown
  aspect_ratio: string | null
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('--') ? value.trim() : null
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function createSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceKey) throw new Error('Supabase service env is required.')
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}

function normalizeNotes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }
  if (typeof value === 'string') {
    try {
      return normalizeNotes(JSON.parse(value) as unknown)
    } catch {
      return []
    }
  }
  return []
}

function compact(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function includesNormalizationMediaIdFailure(row: MetricoolHandoffRow): boolean {
  const haystack = [
    row.error,
    row.response_status,
    typeof row.response_body === 'string' ? row.response_body : JSON.stringify(row.response_body ?? {}),
    JSON.stringify(row.request_payload ?? {}),
  ].map(compact).join(' ').toLowerCase()

  return (
    haystack.includes('mediaid') ||
    haystack.includes('media id') ||
    haystack.includes('normalization') ||
    haystack.includes('normalize')
  ) && (
    haystack.includes('did not return') ||
    haystack.includes('missing') ||
    haystack.includes('failed')
  )
}

function scheduledAtNeedles(value: string | null): string[] {
  if (!value) return []
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return [value]
  return [
    parsed.toISOString(),
    parsed.toISOString().slice(0, 19),
    parsed.toISOString().slice(0, 10),
  ]
}

function schedulerEndpoint(apiUrl: string, blogId: string, userId: string): URL {
  const url = new URL(`${apiUrl.replace(/\/+$/, '')}/v2/scheduler/posts`)
  url.searchParams.set('blogId', blogId)
  url.searchParams.set('userId', userId)
  url.searchParams.set('integrationSource', 'RBHQ')
  return url
}

async function assertNoMetricoolDuplicate(input: {
  apiUrl: string
  apiKey: string
  blogId: string
  userId: string
  caption: string
  scheduledAt: string | null
}) {
  const endpoint = schedulerEndpoint(input.apiUrl, input.blogId, input.userId)
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'X-Mc-Auth': input.apiKey,
      'Content-Type': 'application/json',
    },
  })
  const body = await response.json().catch(() => null) as { data?: unknown } | null
  if (!response.ok) {
    throw new Error(`Metricool duplicate check failed with HTTP ${response.status}.`)
  }

  const items = Array.isArray(body?.data) ? body.data : []
  const serialized = JSON.stringify(items).toLowerCase()
  const captionNeedle = input.caption.slice(0, 80).toLowerCase()
  const hasCaption = Boolean(captionNeedle) && serialized.includes(captionNeedle)
  const hasDate = scheduledAtNeedles(input.scheduledAt).some((needle) => serialized.includes(needle.toLowerCase()))
  if (hasCaption || hasDate) {
    throw new Error('Metricool duplicate check found an existing scheduled post matching this clip caption/date.')
  }

  return {
    checked: true,
    status: response.status,
    itemCount: items.length,
    duplicate: false,
    checkedCaption: Boolean(captionNeedle),
    checkedScheduledAt: Boolean(input.scheduledAt),
  }
}

async function main() {
  const clipId = readArg('--clip-id')
  if (!clipId) throw new Error('--clip-id is required.')

  const scheduledAt = readArg('--scheduled-at')
  const db = createSupabaseClient()
  const clip = await getClipById(clipId, { includeMetricoolHandoffStatus: false })
  if (!clip) throw new Error(`Clip ${clipId} not found.`)

  const [{ data: assetRow, error: assetError }, { data: handoffRows, error: handoffError }] = await Promise.all([
    db
      .from('clips')
      .select('id, status, publish_status, asset_storage_provider, asset_public_url, moderation_notes, aspect_ratio')
      .eq('id', clipId)
      .maybeSingle(),
    db
      .from('metricool_handoffs')
      .select('id, status, publish_status, error, response_status, response_body, request_payload, created_at')
      .eq('clip_id', clipId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])
  if (assetError) throw new Error(assetError.message)
  if (handoffError) throw new Error(handoffError.message)
  if (!assetRow) throw new Error(`Clip ${clipId} asset row not found.`)

  const row = assetRow as ClipAssetRow
  if (row.id !== clipId) throw new Error('Unexpected clip row returned.')
  if (row.status !== 'approved') throw new Error(`Refusing reset: clip status is ${row.status ?? 'null'}.`)
  if (row.publish_status !== 'metricool_failed') {
    throw new Error(`Refusing reset: publish_status is ${row.publish_status ?? 'null'}, not metricool_failed.`)
  }
  if (row.asset_storage_provider !== 'r2') {
    throw new Error(`Refusing reset: asset_storage_provider is ${row.asset_storage_provider ?? 'null'}, not r2.`)
  }
  if (!row.asset_public_url?.startsWith('https://')) {
    throw new Error('Refusing reset: asset_public_url is not an HTTPS URL.')
  }

  const readiness = getTikTokVerticalReadiness({
    aspect_ratio: row.aspect_ratio,
    moderation_notes: normalizeNotes(row.moderation_notes),
  })
  if (readiness.width !== 1080 || readiness.height !== 1920 || readiness.verticalStatus !== 'vertical_ready') {
    throw new Error('Refusing reset: clip is not render_width=1080/render_height=1920 vertical_ready.')
  }

  const failures = ((handoffRows ?? []) as MetricoolHandoffRow[]).filter((handoff) =>
    handoff.status === 'failed' || handoff.publish_status === 'metricool_failed'
  )
  const normalizationFailure = failures.find(includesNormalizationMediaIdFailure)
  if (!normalizationFailure) {
    throw new Error('Refusing reset: no recent Metricool normalization/mediaId failure was found for this clip.')
  }

  const exportPackage = buildPublishExportPackage(clip)
  const apiUrl = requiredEnv('METRICOOL_API_URL')
  const apiKey = requiredEnv('METRICOOL_API_KEY')
  const userId = requiredEnv('METRICOOL_USER_ID')
  const blogId = requiredEnv('METRICOOL_BRAND_RB_WOMEN')
  const duplicateCheck = await assertNoMetricoolDuplicate({
    apiUrl,
    apiKey,
    blogId,
    userId,
    caption: exportPackage.caption,
    scheduledAt,
  })

  const { data: updated, error: updateError } = await db
    .from('clips')
    .update({
      publish_status: 'ready_for_manual_publish',
      updated_at: new Date().toISOString(),
    })
    .eq('id', clipId)
    .eq('status', 'approved')
    .eq('publish_status', 'metricool_failed')
    .select('id, status, publish_status, updated_at')
    .maybeSingle()
  if (updateError) throw new Error(updateError.message)
  if (!updated) throw new Error('Reset update did not modify the clip.')

  console.log(JSON.stringify({
    result: 'PASS',
    safety: {
      schedules: false,
      posts: false,
      uploadsToTikTok: false,
      uploadsToInstagram: false,
      uploadsToYouTube: false,
      printsSecrets: false,
      resetsOnlyRequestedClip: true,
    },
    clip: updated,
    guards: {
      approved: true,
      wasMetricoolFailed: true,
      r2Asset: true,
      httpsAssetPublicUrl: true,
      renderWidth: readiness.width,
      renderHeight: readiness.height,
      verticalStatus: readiness.verticalStatus,
      failureEvidence: {
        handoffId: normalizationFailure.id,
        error: normalizationFailure.error,
        responseStatus: normalizationFailure.response_status,
      },
      metricoolDuplicateCheck: duplicateCheck,
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
