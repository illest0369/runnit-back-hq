const DEFAULT_APIFY_BASE_URL = 'https://api.apify.com/v2'
const DEFAULT_PAGE_SIZE = 100

export type ApifyRun = {
  id: string
  status: string
  defaultDatasetId?: string | null
}

type ApifyEnvelope<T> = {
  data: T
}

function getApifyBaseUrl() {
  return process.env.APIFY_BASE_URL?.trim() || DEFAULT_APIFY_BASE_URL
}

export function resolveApifyToken(): string | null {
  return process.env.APIFY_TOKEN?.trim() || process.env.APIFY_API_TOKEN?.trim() || null
}

function getApifyToken() {
  const token = resolveApifyToken()
  if (!token) {
    throw new Error('APIFY_TOKEN or APIFY_API_TOKEN is required.')
  }

  return token
}

function withToken(pathname: string) {
  const baseUrl = getApifyBaseUrl().replace(/\/$/, '')
  const url = new URL(`${baseUrl}${pathname}`)
  url.searchParams.set('token', getApifyToken())
  return url
}

async function apifyFetch<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(withToken(pathname), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw new Error(`APIFY_${response.status}:${await response.text()}`)
  }

  return response.json() as Promise<T>
}

export async function runApifyActor(actorId: string, input: Record<string, unknown>) {
  const result = await apifyFetch<ApifyEnvelope<ApifyRun>>(
    `/acts/${encodeURIComponent(actorId)}/runs`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )

  return result.data
}

export async function getApifyRun(runId: string) {
  const result = await apifyFetch<ApifyEnvelope<ApifyRun>>(
    `/actor-runs/${encodeURIComponent(runId)}`,
  )

  return result.data
}

export async function getApifyRunDatasetId(runId: string): Promise<string> {
  const run = await getApifyRun(runId)
  if (!run.defaultDatasetId) {
    throw new Error(`APIFY_RUN_MISSING_DATASET:${runId}`)
  }

  return run.defaultDatasetId
}

export async function getApifyDatasetItems<T>(
  datasetId: string,
  options: { pageSize?: number; maxItems?: number } = {},
): Promise<T[]> {
  const pageSize = Math.min(1000, Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE))
  const maxItems = options.maxItems ? Math.max(1, options.maxItems) : Infinity
  const items: T[] = []
  let offset = 0

  while (items.length < maxItems) {
    const limit = Math.min(pageSize, maxItems - items.length)
    const page = await apifyFetch<T[]>(
      `/datasets/${encodeURIComponent(datasetId)}/items?clean=true&offset=${offset}&limit=${limit}`,
    )

    items.push(...page)

    if (page.length < limit) {
      break
    }

    offset += page.length
  }

  return items
}
