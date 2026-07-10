import { config } from 'dotenv'

import { runMacMiniDryRunWorker } from '../lib/mac-mini-dry-run-worker'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  return value && !value.startsWith('--') ? value.trim() : null
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function readNumberArg(name: string, fallback: number): number {
  const value = readArg(name)
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`)
  }
  return Math.trunc(parsed)
}

function readBrowserArg() {
  const value = readArg('--browser') ?? process.env.MAC_MINI_TIKTOK_BROWSER ?? ''
  if (!value) return undefined
  if (value === 'chrome' || value === 'chromium' || value === 'webkit' || value === 'cdp') return value
  throw new Error('--browser/MAC_MINI_TIKTOK_BROWSER must be one of chrome, chromium, webkit, or cdp.')
}

function readOptionalNumberArg(name: string, envName: string): number | null {
  const argValue = readArg(name)
  const envValue = process.env[envName]
  const value = argValue ?? envValue ?? ''
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name}/${envName} must be a positive number.`)
  }
  return Math.trunc(parsed)
}

function apiBaseUrl(): string {
  const value = readArg('--base-url') ?? process.env.MAC_MINI_API_BASE_URL ?? process.env.RBHQ_BASE_URL ?? ''
  if (!value.trim()) {
    throw new Error('Missing base URL. Set MAC_MINI_API_BASE_URL/RBHQ_BASE_URL or pass --base-url <url>.')
  }
  return value
}

function workerToken(): string {
  const value = readArg('--token') ?? process.env.MAC_MINI_WORKER_TOKEN ?? ''
  if (!value.trim()) {
    throw new Error('Missing MAC_MINI_WORKER_TOKEN or --token.')
  }
  return value
}

async function main() {
  const result = await runMacMiniDryRunWorker({
    baseUrl: apiBaseUrl(),
    token: workerToken(),
    workerId: readArg('--worker-id') ?? process.env.MAC_MINI_WORKER_ID ?? 'mac-mini-local-live-post-worker',
    limit: readNumberArg('--limit', 1),
    browser: readBrowserArg(),
    cdpEndpoint: readArg('--cdp-endpoint') ?? process.env.MAC_MINI_TIKTOK_CDP_ENDPOINT ?? null,
    cdpPort: readOptionalNumberArg('--cdp-port', 'MAC_MINI_TIKTOK_CDP_PORT'),
    launchCdpChrome: hasFlag('--launch-cdp-chrome') || process.env.MAC_MINI_TIKTOK_LAUNCH_CDP_CHROME === 'true',
    headless: hasFlag('--headless'),
    timeoutMs: readNumberArg('--timeout-ms', 45_000),
    artifactDir: readArg('--artifact-dir') ?? undefined,
    keepDraft: hasFlag('--keep-draft'),
    livePost: true,
    allowFinalPost: hasFlag('--allow-final-post'),
  })

  console.log(JSON.stringify(result, null, 2))
  if (result.result === 'FAIL') {
    process.exitCode = 1
  }
}

void main().catch((error) => {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
    safety: {
      publishAction: 'dry_run',
      callsMetricool: false,
      callsN8n: false,
      schedulesPost: false,
      clicksFinalPost: false,
      livePublishStateSet: false,
    },
  }, null, 2))
  process.exitCode = 1
})
