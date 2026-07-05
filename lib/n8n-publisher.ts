import { createHmac } from 'node:crypto'

import { buildPublishExportPackage } from './export/build-export'
import type { ExportableClip } from './export/types'
import { supabaseAdminClient as supabaseAdmin } from './supabase-admin'

export type PublishProvider = 'manual' | 'metricool' | 'n8n'
export type N8nPublishAction = 'publish_now' | 'schedule' | 'dry_run'
export type N8nHandoffStatus =
  | 'sent_to_n8n'
  | 'n8n_not_configured'
  | 'n8n_test_mode'
  | 'n8n_failed'

export type N8nConfigReport = {
  provider: PublishProvider
  webhookUrlPresent: boolean
  secretPresent: boolean
  testMode: boolean
  timeoutMs: number
  configured: boolean
}

export type N8nPostPayload = {
  version: 'rbhq-n8n-publish-v1'
  provider: 'n8n'
  testMode: boolean
  publishAction: N8nPublishAction
  requestedPublishAction: Exclude<N8nPublishAction, 'dry_run'>
  scheduledAt: string | null
  targetPlatform: 'tiktok'
  postId: string
  clipId: string
  channelId: string | null
  title: string
  hook: string
  caption: string
  hashtags: string[]
  media: {
    url: string | null
    path: string | null
    localPath: string | null
    thumbnailUrl: string | null
    durationSeconds: number | null
    width: number | null
    height: number | null
    sizeBytes: number | null
    mimeType: 'video/mp4' | null
    format: 'mp4' | null
  }
  timing: {
    startSeconds: number | null
    endSeconds: number | null
  }
  source: {
    name: string
    videoUrl: string | null
    sport: string | null
    league: string | null
  }
  tiktokDraft: {
    clipId: string
    title: string
    hook: string
    caption: string
    hashtags: string[]
    mediaPath: string | null
    mediaUrl: string | null
    durationSeconds: number | null
    width: number | null
    height: number | null
    sizeBytes: number | null
    mimeType: 'video/mp4' | null
    format: 'mp4' | null
    sourceVideoUrl: string | null
    startSeconds: number | null
    endSeconds: number | null
    publishAction: N8nPublishAction
    testMode: boolean
  }
  approvedAt: string
  createdAt: string
}

export type N8nHandoffResult = {
  status: N8nHandoffStatus
  automationStatus: 'automation_queued' | null
  payload: N8nPostPayload | null
  responseStatus: number | null
  responseBody: unknown
  error: string | null
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readAutomationStatus(responseBody: unknown): 'automation_queued' | null {
  const object = readObject(responseBody)
  return object?.status === 'automation_queued' ? 'automation_queued' : null
}

function readNoteValue(notes: string[], prefix: string): string | null {
  const note = notes.find((item) => item.startsWith(prefix))
  const value = note?.slice(prefix.length).trim()
  return value || null
}

function readNoteNumber(notes: string[], prefix: string): number | null {
  const value = readNoteValue(notes, prefix)
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readCandidateHashtags(notes: string[]): string[] | null {
  const value = readNoteValue(notes, 'candidate_hashtags:')
  if (!value) return null
  const tags = value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.startsWith('#') ? item : `#${item}`)
  return tags.length > 0 ? [...new Set(tags)] : null
}

function isHttpMediaReference(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const DEFAULT_N8N_TIMEOUT_MS = 10_000
const MIN_N8N_TIMEOUT_MS = 1_000
const MAX_N8N_TIMEOUT_MS = 60_000

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function getPublishProvider(): PublishProvider {
  const provider = process.env.PUBLISH_PROVIDER?.trim().toLowerCase()
  if (provider === 'metricool' || provider === 'n8n' || provider === 'manual') {
    return provider
  }
  return 'manual'
}

export function isN8nTestMode(): boolean {
  return isTruthy(process.env.N8N_TEST_MODE)
}

export function getN8nTimeoutMs(): number {
  const parsed = Number(process.env.N8N_TIMEOUT_MS)
  if (!Number.isFinite(parsed)) return DEFAULT_N8N_TIMEOUT_MS
  return Math.min(MAX_N8N_TIMEOUT_MS, Math.max(MIN_N8N_TIMEOUT_MS, Math.trunc(parsed)))
}

function getN8nWebhookUrl(): string {
  return process.env.N8N_WEBHOOK_URL?.trim() ?? ''
}

function getN8nWebhookSecret(): string {
  return process.env.N8N_WEBHOOK_SECRET?.trim() ?? ''
}

export function getN8nConfigReport(): N8nConfigReport {
  const provider = getPublishProvider()
  const webhookUrlPresent = Boolean(getN8nWebhookUrl())
  const secretPresent = Boolean(getN8nWebhookSecret())

  return {
    provider,
    webhookUrlPresent,
    secretPresent,
    testMode: isN8nTestMode(),
    timeoutMs: getN8nTimeoutMs(),
    configured: provider === 'n8n' && webhookUrlPresent,
  }
}

export function buildN8nPostPayload(
  clip: ExportableClip,
  input: {
    action?: Exclude<N8nPublishAction, 'dry_run'>
    scheduledAt?: string | null
  } = {},
): N8nPostPayload {
  const exportPackage = buildPublishExportPackage(clip)
  const requestedPublishAction = input.action ?? (input.scheduledAt ? 'schedule' : 'publish_now')
  const testMode = isN8nTestMode()
  const notes = exportPackage.moderation_notes
  const renderedPath = readNoteValue(notes, 'rendered_tiktok_mp4:')
  const mediaReference = renderedPath || exportPackage.video_url
  const candidateCaption = readNoteValue(notes, 'candidate_caption:')
  const candidateHashtags = readCandidateHashtags(notes)
  const startSeconds = readNoteNumber(notes, 'candidate_start_seconds:')
  const endSeconds = readNoteNumber(notes, 'candidate_end_seconds:')
  const durationSeconds = readNoteNumber(notes, 'render_duration_seconds:') ?? (
    startSeconds !== null && endSeconds !== null ? endSeconds - startSeconds : null
  )
  const width = readNoteNumber(notes, 'render_width:')
  const height = readNoteNumber(notes, 'render_height:')
  const sizeBytes = readNoteNumber(notes, 'render_size_bytes:')
  const mimeType = readNoteValue(notes, 'render_mime_type:') === 'video/mp4' ? 'video/mp4' : null
  const format = readNoteValue(notes, 'render_format:') === 'mp4' ? 'mp4' : null
  const mediaUrl = isHttpMediaReference(mediaReference) ? mediaReference : null
  const mediaPath = mediaUrl ? null : mediaReference
  const caption = candidateCaption || exportPackage.caption
  const hashtags = candidateHashtags || exportPackage.hashtags
  const publishAction = testMode ? 'dry_run' : requestedPublishAction

  return {
    version: 'rbhq-n8n-publish-v1',
    provider: 'n8n',
    testMode,
    publishAction,
    requestedPublishAction,
    scheduledAt: input.scheduledAt ?? null,
    targetPlatform: 'tiktok',
    postId: clip.id,
    clipId: clip.id,
    channelId: clip.channel_id ?? null,
    title: exportPackage.title,
    hook: exportPackage.hook,
    caption,
    hashtags,
    media: {
      url: mediaUrl,
      path: mediaPath,
      localPath: mediaPath,
      thumbnailUrl: exportPackage.thumbnail_url,
      durationSeconds,
      width,
      height,
      sizeBytes,
      mimeType,
      format,
    },
    timing: {
      startSeconds,
      endSeconds,
    },
    source: {
      name: exportPackage.source_name,
      videoUrl: clip.source_url ?? null,
      sport: exportPackage.sport,
      league: exportPackage.league,
    },
    tiktokDraft: {
      clipId: clip.id,
      title: exportPackage.title,
      hook: exportPackage.hook,
      caption,
      hashtags,
      mediaPath,
      mediaUrl,
      durationSeconds,
      width,
      height,
      sizeBytes,
      mimeType,
      format,
      sourceVideoUrl: clip.source_url ?? null,
      startSeconds,
      endSeconds,
      publishAction,
      testMode,
    },
    approvedAt: exportPackage.approved_at,
    createdAt: new Date().toISOString(),
  }
}

function buildSignedHeaders(body: string): HeadersInit {
  const secret = getN8nWebhookSecret()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'RBHQ-n8n-Bridge/1.0',
    'X-RBHQ-Bridge': 'n8n',
  }

  if (secret) {
    headers['X-RBHQ-N8N-Secret'] = secret
    headers['X-RBHQ-N8N-Signature'] = createHmac('sha256', secret)
      .update(body)
      .digest('hex')
  }

  return headers
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function isN8nHandoffSchemaError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('n8n_handoffs') || message.includes('does not exist')
}

export async function recordN8nHandoff(input: {
  clip: ExportableClip
  result: N8nHandoffResult
  webhookUrlPresent: boolean
}) {
  try {
    const { error } = await supabaseAdmin.from('n8n_handoffs').insert({
      clip_id: input.clip.id,
      channel_id: input.clip.channel_id ?? null,
      webhook_url_present: input.webhookUrlPresent,
      request_payload: input.result.payload,
      response_status: input.result.responseStatus,
      response_body: input.result.responseBody,
      status: input.result.status,
      error: input.result.error,
    })

    if (error && !isN8nHandoffSchemaError(error)) {
      console.warn('[n8n] handoff log skipped:', error.message)
    }
  } catch (error) {
    console.warn('[n8n] handoff log skipped:', error instanceof Error ? error.message : error)
  }
}

export async function sendClipToN8n(
  clip: ExportableClip,
  input: {
    action?: Exclude<N8nPublishAction, 'dry_run'>
    scheduledAt?: string | null
  } = {},
): Promise<N8nHandoffResult> {
  const config = getN8nConfigReport()
  const payload = buildN8nPostPayload(clip, input)

  if (config.provider !== 'n8n') {
    const result: N8nHandoffResult = {
      status: 'n8n_not_configured',
      automationStatus: null,
      payload,
      responseStatus: null,
      responseBody: null,
      error: `PUBLISH_PROVIDER is ${config.provider}.`,
    }
    await recordN8nHandoff({ clip, result, webhookUrlPresent: config.webhookUrlPresent })
    return result
  }

  if (!config.webhookUrlPresent) {
    const result: N8nHandoffResult = {
      status: config.testMode ? 'n8n_test_mode' : 'n8n_not_configured',
      automationStatus: null,
      payload,
      responseStatus: null,
      responseBody: null,
      error: config.testMode ? null : 'N8N_WEBHOOK_URL is required.',
    }
    await recordN8nHandoff({ clip, result, webhookUrlPresent: false })
    return result
  }

  const body = JSON.stringify(payload)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await fetch(getN8nWebhookUrl(), {
      method: 'POST',
      headers: buildSignedHeaders(body),
      body,
      signal: controller.signal,
    })
    const responseBody = await readResponseBody(response)
    const automationStatus = response.ok ? readAutomationStatus(responseBody) : null
    const result: N8nHandoffResult = {
      status: response.ok
        ? config.testMode
          ? 'n8n_test_mode'
          : 'sent_to_n8n'
        : 'n8n_failed',
      automationStatus,
      payload,
      responseStatus: response.status,
      responseBody,
      error: response.ok ? null : 'n8n webhook request failed.',
    }
    await recordN8nHandoff({ clip, result, webhookUrlPresent: true })
    return result
  } catch (error) {
    const result: N8nHandoffResult = {
      status: 'n8n_failed',
      automationStatus: null,
      payload,
      responseStatus: null,
      responseBody: null,
      error: error instanceof Error ? error.message : 'n8n webhook request failed.',
    }
    await recordN8nHandoff({ clip, result, webhookUrlPresent: true })
    return result
  } finally {
    clearTimeout(timeout)
  }
}
