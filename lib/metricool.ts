import { buildPublishExportPackage } from './export/build-export'
import type { ExportableClip } from './export/types'
import { isDownloadableMp4Url } from './media-url'
import { supabaseAdminClient as supabaseAdmin } from './supabase-admin'

export type MetricoolBrandKey =
  | 'METRICOOL_BRAND_RB_SPORTS'
  | 'METRICOOL_BRAND_RB_ARENA'
  | 'METRICOOL_BRAND_RB_WOMEN'
  | 'METRICOOL_BRAND_RB_COMBAT'
  | 'METRICOOL_BRAND_RB_CFB'

export type MetricoolHandoffStatus = 'skipped' | 'accepted' | 'failed'

export type MetricoolHandoffResult = {
  status: MetricoolHandoffStatus
  publishStatus:
    | 'needs_clip_render'
    | 'ready_for_manual_publish'
    | 'metricool_scheduled'
    | 'metricool_published'
    | 'metricool_failed'
  brandId: string | null
  endpoint: string | null
  requestPayload: Record<string, unknown> | null
  responseStatus: number | null
  responseBody: unknown
  metricoolPostId: string | null
  error: string | null
}

type MetricoolConfig = {
  apiUrl: string
  apiKey: string
  userId: string
}

type MetricoolSchedulerPayload = Record<string, unknown>

export type MetricoolConfigStatus = {
  ok: boolean
  mode: 'live' | 'dry_run'
  testMode: boolean
  brandEnvName: MetricoolBrandKey | null
  hasBrandId: boolean
  hasLiveCredentials: boolean
  missing: string[]
  error: string | null
}

export type MetricoolAuthDebugShape = {
  endpointPath: string | null
  endpointQueryParamNames: string[]
  userIdQueryParamPresent: boolean
  headerNames: string[]
  usesAuthorizationBearer: false
  tokenPresent: boolean
  tokenTrimLength: number
  tokenTrimLengthGreaterThanZero: boolean
  tokenStartsWithBearer: boolean
  tokenContainsWhitespaceOrNewline: boolean
  tokenFirstCharCategory: string | null
  tokenLastCharCategory: string | null
}

const CHANNEL_TO_METRICOOL_ENV: Record<string, MetricoolBrandKey> = {
  'a1000000-0000-0000-0000-000000000001': 'METRICOOL_BRAND_RB_SPORTS',
  'a1000000-0000-0000-0000-000000000002': 'METRICOOL_BRAND_RB_ARENA',
  'a1000000-0000-0000-0000-000000000004': 'METRICOOL_BRAND_RB_WOMEN',
  'a1000000-0000-0000-0000-000000000003': 'METRICOOL_BRAND_RB_COMBAT',
  '93484eef-06d8-46fd-bce2-ce252422c58e': 'METRICOOL_BRAND_RB_CFB',
}

const METRICOOL_LIVE_ENV_NAMES = [
  'METRICOOL_API_URL',
  'METRICOOL_API_KEY',
  'METRICOOL_USER_ID',
] as const

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required for Metricool handoff.`)
  }
  return value
}

export function isMetricoolTestMode(): boolean {
  return isTruthy(process.env.METRICOOL_TEST_MODE)
}

export function getMetricoolBrandEnvName(channelId: string | null | undefined): MetricoolBrandKey | null {
  return channelId ? CHANNEL_TO_METRICOOL_ENV[channelId] ?? null : null
}

export function resolveMetricoolBrandId(channelId: string | null | undefined): string {
  const envName = getMetricoolBrandEnvName(channelId)
  if (!envName) {
    throw new Error(`No Metricool brand mapping for channel ${channelId ?? 'unknown'}.`)
  }
  return readRequiredEnv(envName)
}

export function getMetricoolConfigStatusForChannel(channelId: string | null | undefined): MetricoolConfigStatus {
  const envName = getMetricoolBrandEnvName(channelId)
  const testMode = isMetricoolTestMode()
  if (!envName) {
    return {
      ok: false,
      mode: 'dry_run',
      testMode,
      brandEnvName: null,
      hasBrandId: false,
      hasLiveCredentials: false,
      missing: [],
      error: `No Metricool brand mapping for channel ${channelId ?? 'unknown'}.`,
    }
  }

  const missing = [
    ...(!process.env[envName]?.trim() ? [envName] : []),
    ...METRICOOL_LIVE_ENV_NAMES.filter((name) => !process.env[name]?.trim()),
  ]
  const hasBrandId = Boolean(process.env[envName]?.trim())
  const hasLiveCredentials = METRICOOL_LIVE_ENV_NAMES.every((name) => Boolean(process.env[name]?.trim()))
  const liveReady = hasBrandId && hasLiveCredentials && !testMode

  return {
    ok: true,
    mode: liveReady ? 'live' : 'dry_run',
    testMode,
    brandEnvName: envName,
    hasBrandId,
    hasLiveCredentials,
    missing,
    error: null,
  }
}

export function validateMetricoolConfigForChannel(channelId: string | null | undefined): { ok: true } | { ok: false; error: string } {
  const status = getMetricoolConfigStatusForChannel(channelId)
  if (!status.ok) {
    return { ok: false, error: status.error ?? 'Metricool is not configured for this channel.' }
  }

  return { ok: true }
}

export function validateMetricoolLiveConfigForChannel(channelId: string | null | undefined): { ok: true } | { ok: false; error: string } {
  const status = getMetricoolConfigStatusForChannel(channelId)
  if (!status.ok) {
    return { ok: false, error: status.error ?? 'Metricool is not configured for this channel.' }
  }

  if (status.mode !== 'live') {
    return {
      ok: false,
      error: status.testMode
        ? 'METRICOOL_TEST_MODE is enabled.'
        : `Missing Metricool live env: ${status.missing.join(', ')}`,
    }
  }

  return { ok: true }
}

export function getMetricoolConfigReport() {
  const channels = Object.entries(CHANNEL_TO_METRICOOL_ENV).map(([channelId, brandEnvName]) => {
    const status = getMetricoolConfigStatusForChannel(channelId)
    return {
      channelId,
      brandEnvName,
      mode: status.mode,
      testMode: status.testMode,
      hasBrandId: status.hasBrandId,
      hasLiveCredentials: status.hasLiveCredentials,
      missing: status.missing,
      ok: status.ok,
    }
  })

  return {
    testMode: isMetricoolTestMode(),
    env: {
      METRICOOL_API_URL: Boolean(process.env.METRICOOL_API_URL?.trim()),
      METRICOOL_API_KEY: Boolean(process.env.METRICOOL_API_KEY?.trim()),
      METRICOOL_USER_ID: Boolean(process.env.METRICOOL_USER_ID?.trim()),
      METRICOOL_TEST_MODE: Boolean(process.env.METRICOOL_TEST_MODE?.trim()),
      METRICOOL_TIMEZONE: Boolean(process.env.METRICOOL_TIMEZONE?.trim()),
    },
    channels,
  }
}

export async function validateMetricoolConnectivity(): Promise<{
  ok: boolean
  status: number | null
  error: string | null
}> {
  if (isMetricoolTestMode()) {
    return { ok: true, status: null, error: 'Skipped in METRICOOL_TEST_MODE.' }
  }

  for (const name of METRICOOL_LIVE_ENV_NAMES) {
    if (!process.env[name]?.trim()) {
      return { ok: false, status: null, error: `${name} is required for live Metricool validation.` }
    }
  }

  try {
    const config = getMetricoolConfig()
    const url = new URL(`${config.apiUrl}/admin/simpleProfiles`)
    url.searchParams.set('userId', config.userId)
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Mc-Auth': config.apiKey,
        'Content-Type': 'application/json',
      },
    })
    await readResponseBody(response)
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : 'Metricool connectivity check failed.',
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : 'Metricool connectivity check failed.',
    }
  }
}

function characterCategory(value: string | undefined): string | null {
  if (!value) return null
  if (/[A-Z]/.test(value)) return 'uppercase_letter'
  if (/[a-z]/.test(value)) return 'lowercase_letter'
  if (/[0-9]/.test(value)) return 'digit'
  if (/\s/.test(value)) return 'whitespace'
  return 'symbol'
}

export function getMetricoolAuthDebugShape(): MetricoolAuthDebugShape {
  const rawToken = process.env.METRICOOL_API_KEY ?? ''
  const trimmedToken = rawToken.trim()
  const apiUrl = process.env.METRICOOL_API_URL?.trim().replace(/\/+$/, '') ?? ''
  const userId = process.env.METRICOOL_USER_ID?.trim() ?? ''
  let endpointPath: string | null = null
  let endpointQueryParamNames: string[] = []
  let userIdQueryParamPresent = false

  if (apiUrl) {
    try {
      const url = new URL(`${apiUrl}/admin/simpleProfiles`)
      if (userId) {
        url.searchParams.set('userId', userId)
      }
      endpointPath = url.pathname
      endpointQueryParamNames = [...url.searchParams.keys()]
      userIdQueryParamPresent = url.searchParams.has('userId')
    } catch {
      endpointPath = null
    }
  }

  return {
    endpointPath,
    endpointQueryParamNames,
    userIdQueryParamPresent,
    headerNames: ['X-Mc-Auth', 'Content-Type'],
    usesAuthorizationBearer: false,
    tokenPresent: Boolean(trimmedToken),
    tokenTrimLength: trimmedToken.length,
    tokenTrimLengthGreaterThanZero: trimmedToken.length > 0,
    tokenStartsWithBearer: /^Bearer\s+/i.test(trimmedToken),
    tokenContainsWhitespaceOrNewline: /\s/.test(rawToken),
    tokenFirstCharCategory: characterCategory(trimmedToken[0]),
    tokenLastCharCategory: characterCategory(trimmedToken[trimmedToken.length - 1]),
  }
}

export function assertMetricoolLiveConfigForChannel(channelId: string | null | undefined): void {
  const status = getMetricoolConfigStatusForChannel(channelId)
  if (!status.ok) {
    throw new Error(status.error ?? 'Metricool is not configured for this channel.')
  }

  if (status.mode !== 'live') {
    throw new Error(
      status.testMode
        ? 'METRICOOL_TEST_MODE is enabled; live Metricool calls are disabled.'
        : `Missing Metricool live env: ${status.missing.join(', ')}`,
    )
  }
}

function getMetricoolBrandIdForDryRun(channelId: string | null | undefined): string | null {
  const envName = getMetricoolBrandEnvName(channelId)
  if (!envName) {
    return null
  }

  if (!process.env[envName]?.trim()) {
    return null
  }

  return process.env[envName]?.trim() ?? null
}

export function hasMetricoolConfigForChannel(channelId: string | null | undefined): boolean {
  return validateMetricoolConfigForChannel(channelId).ok
}

function getMetricoolConfig(): MetricoolConfig {
  return {
    apiUrl: readRequiredEnv('METRICOOL_API_URL').replace(/\/+$/, ''),
    apiKey: readRequiredEnv('METRICOOL_API_KEY'),
    userId: readRequiredEnv('METRICOOL_USER_ID'),
  }
}

export { isDownloadableMp4Url }

function buildMetricoolEndpoint(config: MetricoolConfig, brandId: string): string {
  const url = new URL(`${config.apiUrl}/v2/scheduler/posts`)
  url.searchParams.set('blogId', brandId)
  url.searchParams.set('userId', config.userId)
  return url.toString()
}

export function buildMetricoolSchedulerEndpointPreview(input: {
  apiUrl: string
  blogId: string
  userId: string
}): string {
  return buildMetricoolEndpoint(
    {
      apiUrl: input.apiUrl.replace(/\/+$/, ''),
      apiKey: '',
      userId: input.userId,
    },
    input.blogId,
  )
}

function buildMetricoolJsonHeaders(apiKey: string): Record<string, string> {
  return {
    'X-Mc-Auth': apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

function buildNormalizeEndpoint(config: MetricoolConfig, mediaUrl: string): string {
  const url = new URL(`${config.apiUrl}/actions/normalize/image/url`)
  url.searchParams.set('url', mediaUrl)
  return url.toString()
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

type FoundStringPath = {
  value: string
  path: string
}

function findStringPath(value: unknown, keys: string[], path = '$'): FoundStringPath | null {
  const object = readObject(value)
  if (!object) return null

  for (const key of keys) {
    const entry = object[key]
    if (typeof entry === 'string' && entry.trim()) return { value: entry.trim(), path: `${path}.${key}` }
    if (typeof entry === 'number') return { value: String(entry), path: `${path}.${key}` }
  }

  for (const [key, entry] of Object.entries(object)) {
    const nested = findStringPath(entry, keys, `${path}.${key}`)
    if (nested) return nested
  }

  return null
}

function findString(value: unknown, keys: string[]): string | null {
  return findStringPath(value, keys)?.value ?? null
}

export function getMetricoolMediaIdPath(responseBody: unknown): FoundStringPath | null {
  if (typeof responseBody === 'string' && responseBody.trim()) {
    return { value: responseBody.trim(), path: '$' }
  }

  return findStringPath(responseBody, [
    'mediaId',
    'media_id',
    'mediaID',
    'media',
    'fileId',
    'file_id',
    'resourceId',
    'resource_id',
    'id',
  ])
}

function getMediaId(responseBody: unknown): string | null {
  return getMetricoolMediaIdPath(responseBody)?.value ?? null
}

function getMetricoolPostId(responseBody: unknown): string | null {
  return findString(responseBody, ['postId', 'post_id', 'publicationId', 'publication_id', 'id'])
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

export function formatMetricoolDateTimeForTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const year = values.year
  const month = values.month
  const day = values.day
  const hour = values.hour
  const minute = values.minute
  const second = values.second
  if (!year || !month || !day || !hour || !minute || !second) {
    throw new Error(`Could not format Metricool publicationDate for timezone ${timezone}.`)
  }

  return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}

export function scheduleDate(value?: string | null, timezone = process.env.METRICOOL_TIMEZONE?.trim() || 'America/Los_Angeles'): string {
  const parsed = value ? new Date(value) : null
  const scheduled = parsed && Number.isFinite(parsed.getTime()) && parsed.getTime() > Date.now()
    ? parsed
    : new Date(Date.now() + 5 * 60 * 1000)

  return formatMetricoolDateTimeForTimezone(scheduled, timezone)
}

export function buildSchedulerPayload(input: {
  caption: string
  hashtags: string[]
  mediaId: string
  scheduledAt?: string | null
  title: string
}): MetricoolSchedulerPayload {
  const text = [input.caption, input.hashtags.join(' ')].filter(Boolean).join('\n').trim()
  const timezone = process.env.METRICOOL_TIMEZONE?.trim() || 'America/Los_Angeles'

  return {
    autoPublish: true,
    descendants: [],
    draft: false,
    firstCommentText: '',
    hasNotReadNotes: false,
    media: { mediaId: input.mediaId },
    mediaAltText: [],
    providers: [{ network: 'tiktok' }],
    publicationDate: {
      dateTime: scheduleDate(input.scheduledAt, timezone),
      timezone,
    },
    shortener: false,
    smartLinkData: { ids: [] },
    text,
    tiktokData: {
      autoAddMusic: false,
      commercialContentOwnBrand: false,
      commercialContentThirdParty: false,
      disableComment: false,
      disableDuet: false,
      disableStitch: false,
      photoCoverIndex: 0,
      privacyOption: 'PUBLIC_TO_EVERYONE',
      title: input.title,
    },
  }
}

function readSchedulerObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function assertMetricoolSchedulerContract(payload: MetricoolSchedulerPayload): void {
  const text = typeof payload.text === 'string' ? payload.text.trim() : ''
  const providers = Array.isArray(payload.providers) ? payload.providers : []
  const firstProvider = readSchedulerObject(providers[0])
  const publicationDate = readSchedulerObject(payload.publicationDate)
  const media = readSchedulerObject(payload.media)
  const mediaId = typeof media?.mediaId === 'string' ? media.mediaId.trim() : ''
  const dateTime = typeof publicationDate?.dateTime === 'string' ? publicationDate.dateTime.trim() : ''
  const timezone = typeof publicationDate?.timezone === 'string' ? publicationDate.timezone.trim() : ''
  const network = typeof firstProvider?.network === 'string' ? firstProvider.network.trim() : ''

  const missing = [
    ...(!text ? ['text'] : []),
    ...(providers.length < 1 ? ['providers'] : []),
    ...(!network ? ['providers[0].network'] : []),
    ...(!dateTime ? ['publicationDate.dateTime'] : []),
    ...(!timezone ? ['publicationDate.timezone'] : []),
    ...(!mediaId ? ['media.mediaId'] : []),
  ]

  if (missing.length > 0) {
    throw new Error(`Metricool scheduler payload contract failed: missing ${missing.join(', ')}.`)
  }
}

function findSafeErrorMessages(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (!value || typeof value !== 'object') return []

  if (Array.isArray(value)) {
    return value.flatMap(findSafeErrorMessages)
  }

  const object = value as Record<string, unknown>
  const safeEntries = Object.entries(object).filter(([key]) => !/token|secret|api[-_]?key|authorization|auth/i.test(key))
  const direct = ['error', 'message', 'detail', 'details', 'title', 'description']
    .flatMap((key) => findSafeErrorMessages(object[key]))
  const nested = safeEntries
    .filter(([key]) => !['error', 'message', 'detail', 'details', 'title', 'description'].includes(key))
    .flatMap(([, entry]) => findSafeErrorMessages(entry))

  return [...direct, ...nested].filter((message, index, messages) => messages.indexOf(message) === index)
}

export function metricoolSchedulerError(status: number, responseBody: unknown): string {
  const messages = findSafeErrorMessages(responseBody)
    .map((message) => message.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  return messages.length > 0
    ? `Metricool scheduler request failed with HTTP ${status}: ${messages.slice(0, 6).join(' | ')}`
    : `Metricool scheduler request failed with HTTP ${status}.`
}

export function sanitizeMetricoolDiagnostic(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sanitizeMetricoolDiagnostic)

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    const sensitive = /token|secret|api[-_]?key|authorization|auth/i.test(key)
    return [key, sensitive ? '[redacted]' : sanitizeMetricoolDiagnostic(entry)]
  }))
}

async function recordMetricoolHandoff(input: {
  clip: ExportableClip
  brandId: string | null
  endpoint: string | null
  requestPayload: Record<string, unknown> | null
  responseStatus: number | null
  responseBody: unknown
  metricoolPostId: string | null
  status: MetricoolHandoffStatus
  publishStatus: MetricoolHandoffResult['publishStatus']
  error: string | null
}) {
  try {
    const { error } = await supabaseAdmin.from('metricool_handoffs').insert({
      clip_id: input.clip.id,
      channel_id: input.clip.channel_id ?? null,
      brand_id: input.brandId,
      endpoint: input.endpoint,
      request_payload: input.requestPayload,
      response_status: input.responseStatus,
      response_body: input.responseBody,
      metricool_post_id: input.metricoolPostId,
      status: input.status,
      publish_status: input.publishStatus,
      error: input.error,
    })

    if (error) {
      console.warn('[metricool] handoff log skipped:', error.message)
    }
  } catch (error) {
    console.warn(
      '[metricool] handoff log skipped:',
      error instanceof Error ? error.message : error,
    )
  }
}

export async function sendClipToMetricool(
  clip: ExportableClip,
  input: { scheduledAt?: string | null; mode?: 'publish_now' | 'schedule' } = {},
): Promise<MetricoolHandoffResult> {
  const exportPackage = buildPublishExportPackage(clip)
  const mp4Url = exportPackage.video_url
  const mode = input.mode ?? (input.scheduledAt ? 'schedule' : 'publish_now')

  if (!isDownloadableMp4Url(mp4Url)) {
    const result: MetricoolHandoffResult = {
      status: 'skipped',
      publishStatus: 'needs_clip_render',
      brandId: null,
      endpoint: null,
      requestPayload: null,
      responseStatus: null,
      responseBody: null,
      metricoolPostId: null,
      error: 'Clip media is not a downloadable MP4 URL.',
    }
    await recordMetricoolHandoff({
      clip,
      brandId: null,
      endpoint: null,
      requestPayload: null,
      responseStatus: null,
      responseBody: null,
      metricoolPostId: null,
      status: result.status,
      publishStatus: result.publishStatus,
      error: result.error,
    })
    return result
  }

  let brandId: string | null = null
  let endpoint: string | null = null
  let requestPayload: Record<string, unknown> | null = null

  try {
    const configStatus = getMetricoolConfigStatusForChannel(clip.channel_id)
    if (!configStatus.ok) {
      const result: MetricoolHandoffResult = {
        status: 'failed',
        publishStatus: 'metricool_failed',
        brandId: null,
        endpoint: null,
        requestPayload: null,
        responseStatus: null,
        responseBody: null,
        metricoolPostId: null,
        error: configStatus.error ?? 'Metricool is not configured for this channel.',
      }
      await recordMetricoolHandoff({ clip, ...result })
      return result
    }

    brandId = configStatus.mode === 'live'
      ? resolveMetricoolBrandId(clip.channel_id)
      : getMetricoolBrandIdForDryRun(clip.channel_id)

    if (configStatus.mode !== 'live') {
      const result: MetricoolHandoffResult = {
        status: 'accepted',
        publishStatus: 'ready_for_manual_publish',
        brandId,
        endpoint: null,
        requestPayload: {
          mode,
          scheduledAt: input.scheduledAt ?? null,
          mediaUrl: mp4Url,
          dryRunReason: configStatus.testMode ? 'METRICOOL_TEST_MODE' : 'METRICOOL_LIVE_ENV_MISSING',
          missingEnv: configStatus.missing,
        },
        responseStatus: 202,
        responseBody: {
          ok: true,
          dryRun: true,
          testMode: configStatus.testMode,
          mode,
        },
        metricoolPostId: null,
        error: null,
      }
      await recordMetricoolHandoff({ clip, ...result })
      return result
    }

    const config = getMetricoolConfig()

    const normalizeEndpoint = buildNormalizeEndpoint(config, mp4Url)
    const normalizeResponse = await fetch(normalizeEndpoint, {
      method: 'GET',
      headers: buildMetricoolJsonHeaders(config.apiKey),
    })
    const normalizeBody = await readResponseBody(normalizeResponse)
    if (!normalizeResponse.ok) {
      const result: MetricoolHandoffResult = {
        status: 'failed',
        publishStatus: 'metricool_failed',
        brandId,
        endpoint: normalizeEndpoint,
        requestPayload: { mediaUrl: mp4Url },
        responseStatus: normalizeResponse.status,
        responseBody: normalizeBody,
        metricoolPostId: null,
        error: 'Metricool media normalization failed.',
      }
      await recordMetricoolHandoff({ clip, ...result })
      return result
    }

    const mediaId = getMediaId(normalizeBody)
    if (!mediaId) {
      const result: MetricoolHandoffResult = {
        status: 'failed',
        publishStatus: 'metricool_failed',
        brandId,
        endpoint: normalizeEndpoint,
        requestPayload: { mediaUrl: mp4Url },
        responseStatus: normalizeResponse.status,
        responseBody: normalizeBody,
        metricoolPostId: null,
        error: 'Metricool did not return a mediaId.',
      }
      await recordMetricoolHandoff({ clip, ...result })
      return result
    }

    if (!brandId) {
      const result: MetricoolHandoffResult = {
        status: 'failed',
        publishStatus: 'metricool_failed',
        brandId,
        endpoint: null,
        requestPayload: null,
        responseStatus: null,
        responseBody: null,
        metricoolPostId: null,
        error: 'Metricool brand ID is required for live publishing.',
      }
      await recordMetricoolHandoff({ clip, ...result })
      return result
    }

    endpoint = buildMetricoolEndpoint(config, brandId)
    requestPayload = buildSchedulerPayload({
      caption: exportPackage.caption,
      hashtags: exportPackage.hashtags,
      mediaId,
      scheduledAt: input.scheduledAt,
      title: exportPackage.title,
    })
    assertMetricoolSchedulerContract(requestPayload)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildMetricoolJsonHeaders(config.apiKey),
      body: JSON.stringify(requestPayload),
    })
    const responseBody = await readResponseBody(response)
    const metricoolPostId = getMetricoolPostId(responseBody)
    const result: MetricoolHandoffResult = {
      status: response.ok ? 'accepted' : 'failed',
      publishStatus: response.ok
        ? mode === 'publish_now'
          ? 'metricool_published'
          : 'metricool_scheduled'
        : 'metricool_failed',
      brandId,
      endpoint,
      requestPayload,
      responseStatus: response.status,
      responseBody,
      metricoolPostId,
      error: response.ok ? null : metricoolSchedulerError(response.status, responseBody),
    }

    await recordMetricoolHandoff({ clip, ...result })
    return result
  } catch (error) {
    const result: MetricoolHandoffResult = {
      status: 'failed',
      publishStatus: 'metricool_failed',
      brandId,
      endpoint,
      requestPayload,
      responseStatus: null,
      responseBody: null,
      metricoolPostId: null,
      error: error instanceof Error ? error.message : 'Metricool handoff failed.',
    }
    await recordMetricoolHandoff({ clip, ...result })
    return result
  }
}
