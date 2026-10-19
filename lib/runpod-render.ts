import { createGeneratedClipUploadTarget } from './clip-storage'

export type RunPodRenderInput = {
  sourceUrl: string
  storagePath: string
  startSeconds: number
  endSeconds: number
  captionText?: string
}

export type RunPodRenderResult = {
  publicUrl: string
  cdnUrl: string
  localUrl: null
  storageMode: 'r2'
  runPodJobId: string
  durationSeconds: number
  width: number
  height: number
  sizeBytes: number
}

export type RunPodTranscriptResult = {
  text: string
  segments: Array<{ start: number; end: number; text: string }>
  durationSeconds: number
  language: string
  model: string
  runPodJobId: string
}

type RunPodConfig = {
  endpointId: string
  apiKey: string
}

type UploadTarget = {
  uploadUrl: string
  publicUrl: string
}

type RunPodDependencies = {
  config?: RunPodConfig
  createUploadTarget?: (storagePath: string) => Promise<UploadTarget>
  fetchImpl?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
  pollIntervalMs?: number
  maxWaitMs?: number
}

type RunPodStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT'

type RunPodResponse = {
  id?: unknown
  status?: unknown
  output?: unknown
}

function requiredRunPodConfig(): RunPodConfig {
  const endpointId = process.env.RUNPOD_ENDPOINT_ID?.trim()
  const apiKey = process.env.RUNPOD_API_KEY?.trim()

  if (!endpointId || !apiKey) {
    throw new Error('Missing RunPod configuration. Set RUNPOD_ENDPOINT_ID and RUNPOD_API_KEY.')
  }

  return { endpointId, apiKey }
}

export function hasRunPodRenderConfig() {
  return Boolean(process.env.RUNPOD_ENDPOINT_ID?.trim() && process.env.RUNPOD_API_KEY?.trim())
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

async function readRunPodResponse(response: Response): Promise<RunPodResponse> {
  if (!response.ok) {
    throw new Error(`RunPod request failed (${response.status} ${response.statusText}).`)
  }

  const payload = await response.json().catch(() => null)
  const record = asRecord(payload)
  if (!record) {
    throw new Error('RunPod returned an invalid JSON response.')
  }

  return record
}

function completedResult(
  response: RunPodResponse,
  expectedPublicUrl: string,
  jobId: string,
): RunPodRenderResult {
  const output = asRecord(response.output)
  if (!output || output.status !== 'rendered') {
    throw new Error('RunPod completed without a valid rendered output.')
  }
  if (output.public_url !== expectedPublicUrl) {
    throw new Error('RunPod returned an unexpected public URL.')
  }

  const durationSeconds = output.duration_seconds
  const width = output.width
  const height = output.height
  const sizeBytes = output.size_bytes
  if (
    typeof durationSeconds !== 'number' || durationSeconds <= 0 || durationSeconds > 60 ||
    width !== 1080 || height !== 1920 ||
    typeof sizeBytes !== 'number' || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0
  ) {
    throw new Error('RunPod returned invalid render metadata.')
  }

  return {
    publicUrl: expectedPublicUrl,
    cdnUrl: expectedPublicUrl,
    localUrl: null,
    storageMode: 'r2',
    runPodJobId: jobId,
    durationSeconds,
    width,
    height,
    sizeBytes,
  }
}

async function submitAndWaitForRunPodJob(
  input: Record<string, unknown>,
  dependencies: RunPodDependencies,
) {
  const config = dependencies.config ?? requiredRunPodConfig()
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const sleep = dependencies.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const pollIntervalMs = dependencies.pollIntervalMs ?? 2_000
  const maxWaitMs = dependencies.maxWaitMs ?? 10 * 60_000

  if (!config.endpointId || !config.apiKey) {
    throw new Error('RunPod endpoint ID and API key are required.')
  }
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) {
    throw new Error('RunPod poll interval must be a positive integer.')
  }
  if (!Number.isSafeInteger(maxWaitMs) || maxWaitMs < pollIntervalMs) {
    throw new Error('RunPod wait limit must be at least one poll interval.')
  }

  const baseUrl = `https://api.runpod.ai/v2/${encodeURIComponent(config.endpointId)}`
  const headers = {
    authorization: `Bearer ${config.apiKey}`,
    'content-type': 'application/json',
  }
  const submitted = await readRunPodResponse(await fetchImpl(`${baseUrl}/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input }),
  }))
  const jobId = typeof submitted.id === 'string' ? submitted.id : ''
  if (!jobId) {
    throw new Error('RunPod did not return a job ID.')
  }

  const maxPolls = Math.max(1, Math.ceil(maxWaitMs / pollIntervalMs))
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0) {
      await sleep(pollIntervalMs)
    }

    const statusResponse = await readRunPodResponse(await fetchImpl(
      `${baseUrl}/status/${encodeURIComponent(jobId)}`,
      { headers: { authorization: headers.authorization } },
    ))
    const status = statusResponse.status as RunPodStatus | undefined

    if (status === 'COMPLETED') {
      return { jobId, response: statusResponse }
    }
    if (status === 'FAILED' || status === 'CANCELLED' || status === 'TIMED_OUT') {
      throw new Error(`RunPod job ended with status ${status}.`)
    }
    if (status !== 'IN_QUEUE' && status !== 'IN_PROGRESS') {
      throw new Error('RunPod returned an unknown job status.')
    }
  }

  throw new Error('RunPod job exceeded the 10-minute wait limit.')
}

export async function renderClipWithRunPod(
  input: RunPodRenderInput,
  dependencies: RunPodDependencies = {},
): Promise<RunPodRenderResult> {
  const createUploadTarget = dependencies.createUploadTarget ?? ((storagePath: string) =>
    createGeneratedClipUploadTarget(storagePath))
  if (!Number.isFinite(input.startSeconds) || !Number.isFinite(input.endSeconds)) {
    throw new Error('RunPod render timestamps must be finite numbers.')
  }
  if (input.startSeconds < 0 || input.endSeconds - input.startSeconds < 1 || input.endSeconds - input.startSeconds > 60) {
    throw new Error('RunPod render duration must be between 1 and 60 seconds.')
  }

  const target = await createUploadTarget(input.storagePath)
  const completed = await submitAndWaitForRunPodJob({
    task: 'render',
    source_url: input.sourceUrl,
    upload_url: target.uploadUrl,
    public_url: target.publicUrl,
    start_seconds: input.startSeconds,
    end_seconds: input.endSeconds,
    caption_text: input.captionText?.trim() ?? '',
  }, dependencies)
  return completedResult(completed.response, target.publicUrl, completed.jobId)
}

export async function transcribeVideoWithRunPod(
  sourceUrl: string,
  dependencies: RunPodDependencies = {},
): Promise<RunPodTranscriptResult> {
  if (!sourceUrl.trim()) {
    throw new Error('RunPod transcription source URL is required.')
  }

  const completed = await submitAndWaitForRunPodJob({
    task: 'transcribe',
    source_url: sourceUrl,
  }, dependencies)
  const output = asRecord(completed.response.output)
  if (!output || output.status !== 'transcribed') {
    throw new Error('RunPod completed without a valid transcript output.')
  }
  const rawSegments = Array.isArray(output.segments) ? output.segments : []
  const segments = rawSegments.map((segment) => {
    const record = asRecord(segment)
    const start = record?.start
    const end = record?.end
    const text = record?.text
    if (
      typeof start !== 'number' || !Number.isFinite(start) || start < 0 ||
      typeof end !== 'number' || !Number.isFinite(end) || end <= start ||
      typeof text !== 'string' || !text.trim()
    ) {
      throw new Error('RunPod returned an invalid transcript segment.')
    }
    return { start, end, text: text.trim() }
  })
  const text = typeof output.text === 'string' ? output.text.trim() : ''
  const durationSeconds = output.duration_seconds
  const language = typeof output.language === 'string' ? output.language.trim() : ''
  const model = typeof output.model === 'string' ? output.model.trim() : ''
  if (
    !text || segments.length === 0 ||
    typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
    !language || !model
  ) {
    throw new Error('RunPod returned invalid transcript metadata.')
  }

  return {
    text,
    segments,
    durationSeconds,
    language,
    model,
    runPodJobId: completed.jobId,
  }
}
