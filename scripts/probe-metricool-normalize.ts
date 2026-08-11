import { config } from 'dotenv'

import { buildPublishExportPackage } from '../lib/export/build-export'
import { buildMetricoolNormalizeHeaders, getMetricoolMediaIdPath } from '../lib/metricool'
import { getClipById } from '../lib/moderation-queue'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

type JsonRecord = Record<string, unknown>

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

function normalizeEndpoint(apiUrl: string, mediaUrl: string): URL {
  const url = new URL(`${apiUrl.replace(/\/+$/, '')}/actions/normalize/image/url`)
  url.searchParams.set('url', mediaUrl)
  return url
}

function redactString(value: string): string {
  return value
    .replace(/https?:\/\/\S+/g, '[redacted_url]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted_token_like]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

function bodyShape(value: unknown, depth = 0): unknown {
  if (depth >= 4) return Array.isArray(value) ? { type: 'array' } : { type: typeof value }
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      sample: value.length > 0 ? bodyShape(value[0], depth + 1) : null,
    }
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as JsonRecord).slice(0, 30)
    return {
      type: 'object',
      keys: Object.keys(value as JsonRecord).slice(0, 50),
      children: Object.fromEntries(entries.map(([key, entry]) => [key, bodyShape(entry, depth + 1)])),
    }
  }
  if (typeof value === 'string') {
    return { type: 'string', sample: redactString(value) }
  }
  return { type: value === null ? 'null' : typeof value }
}

function findErrorMessages(value: unknown, output: string[] = []): string[] {
  if (!value || output.length >= 8) return output
  if (typeof value === 'string') {
    const clean = redactString(value)
    if (clean && /error|invalid|fail|unsupported|media|url|video|image/i.test(clean)) output.push(clean)
    return output
  }
  if (Array.isArray(value)) {
    for (const entry of value) findErrorMessages(entry, output)
    return output
  }
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as JsonRecord)) {
      if (/error|message|detail|reason|description/i.test(key) && typeof entry === 'string') {
        output.push(redactString(entry))
      } else {
        findErrorMessages(entry, output)
      }
      if (output.length >= 8) break
    }
  }
  return [...new Set(output)]
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function headMp4(mediaUrl: string) {
  const response = await fetch(mediaUrl, { method: 'HEAD' })
  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
    contentLength: response.headers.get('content-length'),
  }
}

async function main() {
  const clipId = readArg('--clip-id')
  if (!clipId) throw new Error('--clip-id is required.')

  const clip = await getClipById(clipId, { includeMetricoolHandoffStatus: false })
  if (!clip) throw new Error(`Clip ${clipId} not found.`)

  const exportPackage = buildPublishExportPackage(clip)
  const mediaUrl = exportPackage.video_url
  if (!mediaUrl?.startsWith('https://')) {
    throw new Error(`Clip ${clipId} does not have an HTTPS media URL.`)
  }

  const apiUrl = requiredEnv('METRICOOL_API_URL')
  const apiKey = requiredEnv('METRICOOL_API_KEY')
  const endpoint = normalizeEndpoint(apiUrl, mediaUrl)
  const normalizeHeaders = buildMetricoolNormalizeHeaders(apiKey)
  const [mp4, normalizeResponse] = await Promise.all([
    headMp4(mediaUrl),
    fetch(endpoint, {
      method: 'GET',
      headers: normalizeHeaders,
    }),
  ])
  const responseBody = await readResponseBody(normalizeResponse)
  const mediaId = getMetricoolMediaIdPath(responseBody)
  const topLevelKeys = responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)
    ? Object.keys(responseBody as JsonRecord)
    : []

  console.log(JSON.stringify({
    result: normalizeResponse.ok ? 'PASS' : 'FAIL',
    safety: {
      callsMetricoolNormalize: true,
      callsMetricoolScheduler: false,
      recordsMetricoolHandoff: false,
      posts: false,
      schedules: false,
      uploadsToTikTok: false,
      uploadsToInstagram: false,
      uploadsToYouTube: false,
      printsApiKey: false,
    },
    clip: {
      id: clip.id,
      reviewStatus: clip.status,
      publishStatus: clip.publish_status,
      channelId: clip.channel_id,
    },
    media: {
      urlPresent: true,
      urlScheme: 'https',
      head: mp4,
    },
    normalize: {
      method: 'GET',
      endpointPath: endpoint.pathname,
      queryParamNames: [...endpoint.searchParams.keys()],
      headerNames: Object.keys(normalizeHeaders),
      status: normalizeResponse.status,
      ok: normalizeResponse.ok,
      topLevelKeys,
      responseShape: bodyShape(responseBody),
      errorMessages: findErrorMessages(responseBody),
      mediaId: {
        exists: Boolean(mediaId),
        keyPath: mediaId?.path ?? null,
        valueLength: mediaId?.value.length ?? 0,
      },
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? redactString(error.message) : redactString(String(error)),
  }, null, 2))
  process.exitCode = 1
})
