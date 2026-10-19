import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { renderClipWithRunPod, transcribeVideoWithRunPod } from '../lib/runpod-render'

const input = {
  sourceUrl: 'https://media.example.com/source.mp4',
  storagePath: 'channels/channel-1/generated-clips/clip.mp4',
  startSeconds: 12,
  endSeconds: 24,
  captionText: 'Fourth-quarter comeback',
}

test('RunPod render submits, polls, and validates a vertical R2 result', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const responses = [
    { id: 'job-1' },
    { id: 'job-1', status: 'IN_QUEUE' },
    { id: 'job-1', status: 'IN_PROGRESS' },
    {
      id: 'job-1',
      status: 'COMPLETED',
      output: {
        status: 'rendered',
        public_url: 'https://media.staging.example/channels/channel-1/generated-clips/clip.mp4',
        duration_seconds: 12,
        width: 1080,
        height: 1920,
        size_bytes: 123_456,
      },
    },
  ]

  const result = await renderClipWithRunPod(input, {
    config: { endpointId: 'endpoint-1', apiKey: 'runpod-secret' },
    createUploadTarget: async () => ({
      uploadUrl: 'https://account.r2.cloudflarestorage.com/staging/clip.mp4?X-Amz-Signature=test',
      publicUrl: 'https://media.staging.example/channels/channel-1/generated-clips/clip.mp4',
    }),
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init })
      return new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
    sleep: async () => {},
    pollIntervalMs: 1,
  })

  assert.deepEqual(result, {
    publicUrl: 'https://media.staging.example/channels/channel-1/generated-clips/clip.mp4',
    cdnUrl: 'https://media.staging.example/channels/channel-1/generated-clips/clip.mp4',
    localUrl: null,
    storageMode: 'r2',
    runPodJobId: 'job-1',
    durationSeconds: 12,
    width: 1080,
    height: 1920,
    sizeBytes: 123_456,
  })
  assert.equal(requests.length, 4)
  assert.equal(requests[0]?.url, 'https://api.runpod.ai/v2/endpoint-1/run')
  assert.equal(requests[0]?.init?.method, 'POST')
  assert.equal(new Headers(requests[0]?.init?.headers).get('authorization'), 'Bearer runpod-secret')
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    input: {
      task: 'render',
      source_url: input.sourceUrl,
      upload_url: 'https://account.r2.cloudflarestorage.com/staging/clip.mp4?X-Amz-Signature=test',
      public_url: 'https://media.staging.example/channels/channel-1/generated-clips/clip.mp4',
      start_seconds: 12,
      end_seconds: 24,
      caption_text: 'Fourth-quarter comeback',
    },
  })
})

test('RunPod transcription submits a source-only task and validates segments', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const responses = [
    { id: 'job-transcribe-1' },
    { id: 'job-transcribe-1', status: 'IN_PROGRESS' },
    {
      id: 'job-transcribe-1',
      status: 'COMPLETED',
      output: {
        status: 'transcribed',
        text: 'The final shot won the game.',
        segments: [{ start: 0, end: 4, text: 'The final shot won the game.' }],
        duration_seconds: 4,
        language: 'en',
        model: 'tiny.en',
      },
    },
  ]

  const result = await transcribeVideoWithRunPod(input.sourceUrl, {
    config: { endpointId: 'endpoint-1', apiKey: 'runpod-secret' },
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init })
      return new Response(JSON.stringify(responses.shift()), { status: 200 })
    },
    sleep: async () => {},
    pollIntervalMs: 1,
  })

  assert.deepEqual(result, {
    text: 'The final shot won the game.',
    segments: [{ start: 0, end: 4, text: 'The final shot won the game.' }],
    durationSeconds: 4,
    language: 'en',
    model: 'tiny.en',
    runPodJobId: 'job-transcribe-1',
  })
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    input: { task: 'transcribe', source_url: input.sourceUrl },
  })
})

test('RunPod render fails closed on a mismatched output URL', async () => {
  const responses = [
    { id: 'job-2' },
    {
      id: 'job-2',
      status: 'COMPLETED',
      output: {
        status: 'rendered',
        public_url: 'https://attacker.example/clip.mp4',
        duration_seconds: 12,
        width: 1080,
        height: 1920,
        size_bytes: 123,
      },
    },
  ]

  await assert.rejects(
    renderClipWithRunPod(input, {
      config: { endpointId: 'endpoint-1', apiKey: 'runpod-secret' },
      createUploadTarget: async () => ({
        uploadUrl: 'https://account.r2.cloudflarestorage.com/staging/clip.mp4?signature=test',
        publicUrl: 'https://media.staging.example/channels/channel-1/generated-clips/clip.mp4',
      }),
      fetchImpl: async () => new Response(JSON.stringify(responses.shift()), { status: 200 }),
      sleep: async () => {},
      pollIntervalMs: 1,
    }),
    /unexpected public URL/i,
  )
})

test('clip worker routes configured renders through RunPod after ownership validation', async () => {
  const source = await readFile(new URL('../services/clipService.ts', import.meta.url), 'utf8')

  assert.ok(
    source.indexOf('validateClipGenerationJobOwnership') < source.indexOf('ensureClipDirectories('),
    'ownership validation must happen before clip pipeline side effects',
  )
  assert.match(source, /hasRunPodRenderConfig\(\)/)
  assert.match(source, /transcribeVideoWithRunPod\(input\.videoUrl\)/)
  assert.match(source, /renderClipWithRunPod\(\{[\s\S]*storagePath,[\s\S]*sourceUrl: input\.videoUrl/)
  assert.match(source, /const upload = useRunPod/)
})
