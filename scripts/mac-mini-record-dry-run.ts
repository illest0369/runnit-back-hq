import { config } from 'dotenv'

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

function apiBaseUrl(): string {
  const value = readArg('--base-url') ?? process.env.MAC_MINI_API_BASE_URL ?? process.env.RBHQ_BASE_URL ?? ''
  if (!value.trim()) {
    throw new Error('Missing base URL. Set MAC_MINI_API_BASE_URL/RBHQ_BASE_URL or pass --base-url <url>.')
  }
  return value.replace(/\/+$/, '')
}

function workerToken(): string {
  const value = readArg('--token') ?? process.env.MAC_MINI_WORKER_TOKEN ?? ''
  if (!value.trim()) {
    throw new Error('Missing MAC_MINI_WORKER_TOKEN or --token.')
  }
  return value.trim()
}

async function main() {
  const packageId = readArg('--package-id') ?? process.env.MAC_MINI_PACKAGE_ID?.trim()
  if (!packageId) {
    throw new Error('Missing package id. Use --package-id <mac_mini_clip_package_id>.')
  }

  const status = hasFlag('--success') ? 'success' : hasFlag('--failure') ? 'failure' : readArg('--status')
  if (status !== 'success' && status !== 'failure') {
    throw new Error('Dry-run status must be success or failure.')
  }

  const response = await fetch(`${apiBaseUrl()}/api/mac-mini/packages/${encodeURIComponent(packageId)}/dry-run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rbhq-mac-mini-token': workerToken(),
    },
    body: JSON.stringify({
      status,
      workerId: readArg('--worker-id') ?? process.env.MAC_MINI_WORKER_ID ?? 'mac-mini-local-worker',
      error: readArg('--error'),
      result: {
        source: 'mac-mini-record-dry-run',
        stagedUpload: false,
        clickedFinalPost: false,
      },
    }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Mac mini dry-run status failed: ${response.status} ${JSON.stringify(body)}`)
  }

  console.log(JSON.stringify(body, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
