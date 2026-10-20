type GeminiRuntimeEnv = Record<string, string | undefined>

export type GeminiScoringRuntime = {
  enabled: boolean
  mode: 'disabled' | 'enabled' | 'misconfigured'
}

export type RbhqWorkerCapabilities = {
  clipGeneration: true
  ingest: boolean
  apifyPoll: boolean
  geminiScoring: boolean
  geminiScoringMode: GeminiScoringRuntime['mode']
  postDryRun: true
  analytics: true
}

export function resolveGeminiScoringRuntime(
  env: GeminiRuntimeEnv = process.env,
): GeminiScoringRuntime {
  const explicitlyEnabled = env.RBHQ_GEMINI_SCORING_ENABLED?.trim().toLowerCase() === 'true'
  if (!explicitlyEnabled) {
    return { enabled: false, mode: 'disabled' }
  }

  if (!env.GEMINI_API_KEY?.trim()) {
    return { enabled: false, mode: 'misconfigured' }
  }

  return { enabled: true, mode: 'enabled' }
}

export function assertGeminiScoringEnabled(env: GeminiRuntimeEnv = process.env): void {
  const runtime = resolveGeminiScoringRuntime(env)
  if (runtime.enabled) return

  if (runtime.mode === 'misconfigured') {
    throw new Error('GEMINI_SCORING_ENABLED_WITHOUT_API_KEY')
  }

  throw new Error('GEMINI_SCORING_DISABLED')
}

export function getRbhqWorkerCapabilities(
  env: GeminiRuntimeEnv = process.env,
): RbhqWorkerCapabilities {
  const runtime = resolveGeminiScoringRuntime(env)

  return {
    clipGeneration: true,
    ingest: runtime.enabled,
    apifyPoll: runtime.enabled,
    geminiScoring: runtime.enabled,
    geminiScoringMode: runtime.mode,
    postDryRun: true,
    analytics: true,
  }
}
