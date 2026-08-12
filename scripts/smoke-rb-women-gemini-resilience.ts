import assert from 'node:assert/strict'

import {
  classifyGeminiGenerateError,
  generateGeminiContentWithModelFallback,
} from '../lib/rb-women-opus-pipeline'
import { isGeminiTransientReport } from '../lib/rb-women-autopilot-next'

function apiError(status: number, message = 'mock Gemini failure'): Error {
  return new Error(JSON.stringify({
    error: {
      code: status,
      message,
      status: status === 503 ? 'UNAVAILABLE' : 'ERROR',
    },
  }))
}

async function test503RetriesThenSucceeds() {
  let calls = 0
  const sleeps: number[] = []
  const result = await generateGeminiContentWithModelFallback(
    async () => {
      calls += 1
      if (calls < 3) throw apiError(503, 'high demand')
      return { text: '{"candidates":[]}' }
    },
    {
      primaryModel: 'primary-video',
      maxAttempts: 4,
      initialDelayMs: 100,
      maxDelayMs: 500,
      maxElapsedMs: 10_000,
      sleepFn: async (ms) => { sleeps.push(ms) },
      jitter: () => 0.5,
    },
  )
  assert.equal(result.telemetry.finalStatus, 'ok')
  assert.equal(result.telemetry.attempts, 3)
  assert.equal(result.telemetry.transientFailures, 2)
  assert.deepEqual(sleeps, [100, 200])
}

async function test429Retries() {
  let calls = 0
  const result = await generateGeminiContentWithModelFallback(
    async () => {
      calls += 1
      if (calls === 1) throw apiError(429, 'quota temporarily busy')
      return { text: '{"candidates":[]}' }
    },
    {
      primaryModel: 'primary-video',
      maxAttempts: 3,
      initialDelayMs: 50,
      maxDelayMs: 100,
      maxElapsedMs: 10_000,
      sleepFn: async () => {},
      jitter: () => 0.5,
    },
  )
  assert.equal(result.telemetry.attempts, 2)
  assert.equal(result.telemetry.transientFailures, 1)
}

async function testPermanent400DoesNotRetry() {
  let calls = 0
  await assert.rejects(
    generateGeminiContentWithModelFallback(
      async () => {
        calls += 1
        throw apiError(400, 'invalid request')
      },
      {
        primaryModel: 'primary-video',
        maxAttempts: 4,
        sleepFn: async () => { throw new Error('400 should not sleep') },
      },
    ),
  )
  assert.equal(calls, 1)
  const classified = classifyGeminiGenerateError(apiError(400))
  assert.equal(classified.retryable, false)
  assert.equal(classified.classification, 'permanent_request')
}

async function testFallbackAfterPrimaryExhaustion() {
  const modelCalls: string[] = []
  const result = await generateGeminiContentWithModelFallback(
    async (model) => {
      modelCalls.push(model)
      if (model === 'primary-video') throw apiError(503, 'high demand')
      return { text: '{"candidates":[]}' }
    },
    {
      primaryModel: 'primary-video',
      fallbackModel: 'fallback-video',
      maxAttempts: 2,
      initialDelayMs: 25,
      maxDelayMs: 50,
      maxElapsedMs: 10_000,
      sleepFn: async () => {},
      jitter: () => 0.5,
    },
  )
  assert.deepEqual(modelCalls, ['primary-video', 'primary-video', 'fallback-video'])
  assert.equal(result.telemetry.fallbackUsed, true)
  assert.equal(result.telemetry.modelUsed, 'fallback-video')
  assert.equal(result.telemetry.attempts, 3)
}

async function testTransientFailureTelemetryIsResumable() {
  await assert.rejects(
    async () => {
      await generateGeminiContentWithModelFallback(
        async () => {
          throw apiError(503, 'high demand')
        },
        {
          primaryModel: 'primary-video',
          maxAttempts: 2,
          initialDelayMs: 25,
          maxDelayMs: 50,
          maxElapsedMs: 10_000,
          sleepFn: async () => {},
          jitter: () => 0.5,
        },
      )
    },
    (error) => {
      const telemetry = (error as { telemetry?: { finalStatus?: string; attempts?: number } }).telemetry
      assert.equal(telemetry?.finalStatus, 'transient_failed')
      assert.equal(telemetry?.attempts, 2)
      assert.equal(isGeminiTransientReport({ gemini: telemetry as never }), true)
      return true
    },
  )
}

async function testSecretsNeverLogged() {
  const logs: unknown[] = []
  await generateGeminiContentWithModelFallback(
    async (model) => {
      if (logs.length === 0) {
        throw apiError(503, 'temporary')
      }
      return { text: model }
    },
    {
      primaryModel: 'primary-video',
      maxAttempts: 2,
      initialDelayMs: 25,
      maxDelayMs: 25,
      maxElapsedMs: 10_000,
      sleepFn: async () => {},
      jitter: () => 0.5,
      log: (status, details) => logs.push({ status, details }),
    },
  )
  const serialized = JSON.stringify(logs)
  assert(!/AIza|GEMINI_API_KEY|apiKey|secret|token/i.test(serialized), 'Gemini retry logs exposed a secret-shaped value.')
}

async function main() {
  await test503RetriesThenSucceeds()
  await test429Retries()
  await testPermanent400DoesNotRetry()
  await testFallbackAfterPrimaryExhaustion()
  await testTransientFailureTelemetryIsResumable()
  await testSecretsNeverLogged()

  console.log(JSON.stringify({
    result: 'PASS',
    cases: [
      '503_retries',
      '429_retries',
      'bounded_exponential_backoff',
      'permanent_400_no_retry',
      'fallback_after_primary_exhaustion',
      'transient_failure_resumable',
      'secrets_never_logged',
    ],
    safety: {
      callsGemini: false,
      downloadsVideo: false,
      uploadsToR2: false,
      callsMetricool: false,
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
