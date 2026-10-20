import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  assertGeminiScoringEnabled,
  getRbhqWorkerCapabilities,
  resolveGeminiScoringRuntime,
} from '../lib/gemini/runtime'

test('Gemini scoring is disabled by default while non-AI worker duties stay available', () => {
  const runtime = resolveGeminiScoringRuntime({})
  const capabilities = getRbhqWorkerCapabilities({})

  assert.deepEqual(runtime, { enabled: false, mode: 'disabled' })
  assert.deepEqual(capabilities, {
    clipGeneration: true,
    ingest: false,
    apifyPoll: false,
    geminiScoring: false,
    geminiScoringMode: 'disabled',
    postDryRun: true,
    analytics: true,
  })
})

test('an API key alone cannot silently enable Gemini scoring', () => {
  assert.deepEqual(
    resolveGeminiScoringRuntime({ GEMINI_API_KEY: 'configured-but-not-authorized' }),
    { enabled: false, mode: 'disabled' },
  )
})

test('explicit enablement without a Gemini key fails closed', () => {
  const env = { RBHQ_GEMINI_SCORING_ENABLED: 'true' }

  assert.deepEqual(resolveGeminiScoringRuntime(env), {
    enabled: false,
    mode: 'misconfigured',
  })
  assert.throws(
    () => assertGeminiScoringEnabled(env),
    /GEMINI_SCORING_ENABLED_WITHOUT_API_KEY/,
  )
})

test('Gemini scoring requires both explicit enablement and a configured key', () => {
  const env = {
    RBHQ_GEMINI_SCORING_ENABLED: ' TRUE ',
    GEMINI_API_KEY: 'configured',
  }

  assert.deepEqual(resolveGeminiScoringRuntime(env), {
    enabled: true,
    mode: 'enabled',
  })
  assert.doesNotThrow(() => assertGeminiScoringEnabled(env))
})

test('disabled Gemini scoring rejects direct ingest and scoring entrypoints', () => {
  assert.throws(
    () => assertGeminiScoringEnabled({ RBHQ_GEMINI_SCORING_ENABLED: 'false' }),
    /GEMINI_SCORING_DISABLED/,
  )
})

test('native ingest never imports an unscored fallback batch', async () => {
  const source = await readFile(new URL('../lib/rbhq-native-ingest.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /gemini_unavailable_fallback/)
  assert.doesNotMatch(source, /Gemini scoring was unavailable during ingest/)
})

test('worker startup gates ingest, Apify polling, and scoring behind Gemini capability', async () => {
  const source = await readFile(new URL('../workers/rbhqWorker.ts', import.meta.url), 'utf8')

  assert.match(source, /getRbhqWorkerCapabilities/)
  assert.match(source, /capabilities\.geminiScoring/)
})
