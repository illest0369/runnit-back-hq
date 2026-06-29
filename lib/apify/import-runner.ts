import { getApifyDatasetItems, getApifyRunDatasetId, runApifyActor } from './client'
import { normalizeApifyDatasetItems, type ApifyNormalizationFailure } from './normalize'
import { scoreClipsWithGemini } from '../gemini/score'

type ImportRunnerInput = {
  actorId?: string
  actorInput?: Record<string, unknown>
  runId?: string
  datasetId?: string
  importUrl: string
  importSecret: string
  importBatchId?: string
  defaultSourceName?: string
  defaultSourceType?: string
  maxItems?: number
}

type ImportEndpointResponse = {
  ok: boolean
  inserted_count?: number
  skipped_count?: number
  failed_count?: number
  validation_errors?: unknown[]
  skipped?: unknown[]
  error?: string
}

export type ApifyImportRunnerResult = {
  actor_source: string
  batch_id: string
  dataset_id: string
  fetched_count: number
  normalized_count: number
  normalization_failed_count: number
  normalization_errors: ApifyNormalizationFailure[]
  gemini_failed_count: number
  inserted_count: number
  skipped_count: number
  failed_count: number
  import_response: ImportEndpointResponse
}

function makeBatchId(input: { actorId?: string; runId?: string; datasetId?: string }) {
  const source = input.runId ?? input.datasetId ?? input.actorId ?? 'apify'
  return `apify:${source}:${new Date().toISOString()}`
}

async function postImport(input: {
  importUrl: string
  importSecret: string
  importBatchId: string
  clips: unknown[]
}): Promise<ImportEndpointResponse> {
  const response = await fetch(input.importUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rbhq-import-secret': input.importSecret,
    },
    body: JSON.stringify({
      import_batch_id: input.importBatchId,
      clips: input.clips,
    }),
  })

  const json = (await response.json().catch(() => ({}))) as ImportEndpointResponse
  if (!response.ok) {
    throw new Error(json.error || `IMPORT_ENDPOINT_${response.status}`)
  }

  return json
}

export async function runApifyImport(input: ImportRunnerInput): Promise<ApifyImportRunnerResult> {
  let datasetId = input.datasetId
  let actorSource = datasetId ? `dataset:${datasetId}` : 'unknown'

  if (!datasetId && input.runId) {
    datasetId = await getApifyRunDatasetId(input.runId)
    actorSource = `run:${input.runId}`
  }

  if (!datasetId && input.actorId) {
    const run = await runApifyActor(input.actorId, input.actorInput ?? {})
    if (!run.defaultDatasetId) {
      throw new Error(`APIFY_ACTOR_RUN_MISSING_DATASET:${run.id}`)
    }
    datasetId = run.defaultDatasetId
    actorSource = `actor:${input.actorId}`
  }

  if (!datasetId) {
    throw new Error('datasetId, runId, or actorId is required')
  }

  const batchId = input.importBatchId ?? makeBatchId({
    actorId: input.actorId,
    runId: input.runId,
    datasetId,
  })
  const items = await getApifyDatasetItems<Record<string, unknown>>(datasetId, {
    maxItems: input.maxItems,
  })
  const normalized = normalizeApifyDatasetItems(items, {
    importBatchId: batchId,
    defaultSourceName: input.defaultSourceName,
    defaultSourceType: input.defaultSourceType,
  })
  const scored = await scoreClipsWithGemini(normalized.clips)
  const importResponse = scored.scored.length > 0
    ? await postImport({
        importUrl: input.importUrl,
        importSecret: input.importSecret,
        importBatchId: batchId,
        clips: scored.scored,
      })
    : {
        ok: true,
        inserted_count: 0,
        skipped_count: 0,
        failed_count: 0,
        validation_errors: [],
        skipped: [],
      }

  const result = {
    actor_source: actorSource,
    batch_id: batchId,
    dataset_id: datasetId,
    fetched_count: items.length,
    normalized_count: normalized.clips.length,
    normalization_failed_count: normalized.failed.length,
    normalization_errors: normalized.failed,
    gemini_failed_count: scored.failed.length,
    inserted_count: importResponse.inserted_count ?? 0,
    skipped_count: importResponse.skipped_count ?? 0,
    failed_count: (importResponse.failed_count ?? 0) + normalized.failed.length + scored.failed.length,
    import_response: importResponse,
  }

  console.log('[rbhq-apify-import]', {
    actor_source: result.actor_source,
    batch_id: result.batch_id,
    inserted: result.inserted_count,
    skipped: result.skipped_count,
    failed: result.failed_count,
  })

  return result
}
