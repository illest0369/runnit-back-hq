import { execFile } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

type JsonObject = Record<string, unknown>

export type MacMiniWorkerPackage = {
  id: string
  browserChannelKey: string
  sourceUrl: string
  sourceTitle: string
  caption: string
  hashtags: string[]
  hook: string
  whyNow: string
  operatorSummary: string
  editNotes: string[]
  payload: JsonObject
}

export type MacMiniDryRunWorkerResult = {
  result: 'PASS' | 'FAIL'
  mode: 'metadata_only' | 'browser_dry_run' | 'no_package'
  packageId: string | null
  channelKey: string | null
  profileDir: string | null
  draftPath: string | null
  assetMissing: boolean
  dryRunRecorded: boolean
  uploaderResult: JsonObject | null
  error: string | null
  safety: {
    publishAction: 'dry_run' | null
    testMode: boolean
    callsMetricool: false
    callsN8n: false
    schedulesPost: false
    clicksFinalPost: false
    livePublishStateSet: false
  }
}

export type RunMacMiniDryRunWorkerOptions = {
  baseUrl: string
  token: string
  workerId: string
  limit?: number
  mediaPath?: string | null
  stageUpload?: boolean
  headless?: boolean
  timeoutMs?: number
  artifactDir?: string
  keepDraft?: boolean
}

type WorkerDeps = {
  fetchFn?: typeof fetch
  runUploader?: (args: string[]) => Promise<{ stdout: string; stderr: string }>
}

function compact(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function normalizeBaseUrl(value: string): string {
  const clean = value.trim()
  if (!clean) throw new Error('Mac mini worker requires a base URL.')
  return clean.replace(/\/+$/, '')
}

function readPayloadPackage(raw: unknown): MacMiniWorkerPackage {
  const item = objectValue(raw)
  const payload = objectValue(item.payload)
  const lane = objectValue(payload.lane)
  const source = objectValue(payload.source)
  const draft = objectValue(payload.tiktokDraft)
  const id = compact(item.id || payload.packageId)
  const browserChannelKey = compact(item.browserChannelKey || lane.browserChannelKey)

  if (!id) throw new Error('Fetched Mac mini package is missing id.')
  if (!browserChannelKey) throw new Error(`Mac mini package ${id} is missing browserChannelKey.`)

  return {
    id,
    browserChannelKey,
    sourceUrl: compact(item.sourceUrl || source.url || draft.sourceVideoUrl),
    sourceTitle: compact(item.sourceTitle || source.title || draft.title),
    caption: compact(item.caption || draft.caption),
    hashtags: stringArray(item.hashtags).length ? stringArray(item.hashtags) : stringArray(draft.hashtags),
    hook: compact(item.hook || draft.hook),
    whyNow: compact(item.whyNow || draft.whyNow),
    operatorSummary: compact(item.operatorSummary || draft.operatorSummary),
    editNotes: stringArray(item.editNotes).length ? stringArray(item.editNotes) : stringArray(draft.editNotes),
    payload,
  }
}

function assertSafePackage(pkg: MacMiniWorkerPackage): void {
  if (pkg.payload.targetPlatform !== 'tiktok') {
    throw new Error(`Mac mini package ${pkg.id} targetPlatform must be tiktok.`)
  }
  if (pkg.payload.publishAction !== 'dry_run') {
    throw new Error(`Mac mini package ${pkg.id} publishAction must be dry_run.`)
  }
  if (pkg.payload.testMode !== true) {
    throw new Error(`Mac mini package ${pkg.id} must have testMode=true.`)
  }
  const safety = objectValue(pkg.payload.safety)
  if (safety.finalPostClickAllowed !== false || safety.livePostingAllowed !== false) {
    throw new Error(`Mac mini package ${pkg.id} safety flags must forbid live posting and final Post click.`)
  }
}

function readNestedString(source: JsonObject, pathKeys: string[]): string | null {
  let current: unknown = source
  for (const key of pathKeys) {
    current = objectValue(current)[key]
  }
  const value = compact(current)
  return value || null
}

function mediaPathFromPackage(pkg: MacMiniWorkerPackage): string | null {
  const candidates = [
    readNestedString(pkg.payload, ['mediaPath']),
    readNestedString(pkg.payload, ['localPath']),
    readNestedString(pkg.payload, ['media', 'localPath']),
    readNestedString(pkg.payload, ['media', 'path']),
    readNestedString(pkg.payload, ['tiktokDraft', 'mediaPath']),
    readNestedString(pkg.payload, ['tiktokDraft', 'localPath']),
  ].filter((value): value is string => Boolean(value))

  return candidates[0] ?? null
}

async function verifyLocalMp4(value: string | null): Promise<{ mediaPath: string | null; assetMissing: boolean }> {
  if (!value) return { mediaPath: null, assetMissing: true }
  const mediaPath = path.resolve(value)
  const mediaStat = await stat(mediaPath).catch(() => null)
  if (!mediaStat?.isFile() || !mediaPath.toLowerCase().endsWith('.mp4')) {
    return { mediaPath: null, assetMissing: true }
  }
  return { mediaPath, assetMissing: false }
}

function safeJsonParse(value: string): JsonObject {
  try {
    return objectValue(JSON.parse(value))
  } catch {
    return { raw: value }
  }
}

async function defaultRunUploader(args: string[]) {
  return execFileAsync('./node_modules/.bin/tsx', ['scripts/tiktok-web-upload-dry-run.ts', ...args], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 8,
  })
}

async function fetchJson(fetchFn: typeof fetch, url: string, init: RequestInit): Promise<JsonObject> {
  const response = await fetchFn(url, init)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Mac mini worker request failed: ${response.status} ${JSON.stringify(body)}`)
  }
  return objectValue(body)
}

async function fetchOnePackage(fetchFn: typeof fetch, input: { baseUrl: string; token: string; limit: number }) {
  const body = await fetchJson(fetchFn, `${input.baseUrl}/api/mac-mini/packages?limit=${input.limit}`, {
    headers: { 'x-rbhq-mac-mini-token': input.token },
  })
  const data = Array.isArray(body.data) ? body.data : []
  return data[0] ? readPayloadPackage(data[0]) : null
}

async function recordDryRun(fetchFn: typeof fetch, input: {
  baseUrl: string
  token: string
  packageId: string
  status: 'success' | 'failure'
  workerId: string
  result: JsonObject
  error: string | null
}) {
  await fetchJson(fetchFn, `${input.baseUrl}/api/mac-mini/packages/${encodeURIComponent(input.packageId)}/dry-run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rbhq-mac-mini-token': input.token,
    },
    body: JSON.stringify({
      status: input.status,
      workerId: input.workerId,
      result: input.result,
      error: input.error,
    }),
  })
}

async function writeDraftFile(pkg: MacMiniWorkerPackage, input: {
  channelKey: string
  mediaPath: string | null
  draftDir: string
}) {
  await mkdir(input.draftDir, { recursive: true })
  const draftPath = path.join(input.draftDir, `${pkg.id}.json`)
  const draft = {
    ...pkg.payload,
    channelKey: input.channelKey,
    channel: input.channelKey,
    targetPlatform: 'tiktok',
    publishAction: 'dry_run',
    testMode: true,
    mediaPath: input.mediaPath,
    tiktokDraft: {
      ...objectValue(pkg.payload.tiktokDraft),
      channelKey: input.channelKey,
      mediaPath: input.mediaPath,
      title: pkg.sourceTitle,
      hook: pkg.hook,
      caption: pkg.caption,
      hashtags: pkg.hashtags,
      sourceVideoUrl: pkg.sourceUrl,
      publishAction: 'dry_run',
      testMode: true,
    },
  }
  await writeFile(draftPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf8')
  return draftPath
}

function dryRunSucceeded(uploaderResult: JsonObject): boolean {
  if (uploaderResult.result === 'FAIL') return false
  if (typeof uploaderResult.blocker === 'string' && uploaderResult.blocker) return false
  const safety = objectValue(uploaderResult.safety)
  if (safety.clicksFinalPost !== false) return false
  const staging = objectValue(uploaderResult.staging)
  if (staging.stoppedBeforeFinalPost !== true) return false
  return true
}

export async function runMacMiniDryRunWorker(
  options: RunMacMiniDryRunWorkerOptions,
  deps: WorkerDeps = {},
): Promise<MacMiniDryRunWorkerResult> {
  const fetchFn = deps.fetchFn ?? fetch
  const runUploader = deps.runUploader ?? defaultRunUploader
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const token = options.token.trim()
  if (!token) throw new Error('Mac mini worker requires a token.')

  const baseSafety = {
    publishAction: 'dry_run' as const,
    testMode: true,
    callsMetricool: false as const,
    callsN8n: false as const,
    schedulesPost: false as const,
    clicksFinalPost: false as const,
    livePublishStateSet: false as const,
  }

  const pkg = await fetchOnePackage(fetchFn, { baseUrl, token, limit: options.limit ?? 1 })
  if (!pkg) {
    return {
      result: 'PASS',
      mode: 'no_package',
      packageId: null,
      channelKey: null,
      profileDir: null,
      draftPath: null,
      assetMissing: false,
      dryRunRecorded: false,
      uploaderResult: null,
      error: null,
      safety: baseSafety,
    }
  }

  const workerId = options.workerId || 'mac-mini-local-worker'
  let draftPath: string | null = null
  let profileDir: string | null = null
  let uploaderResult: JsonObject | null = null
  let assetMissing = false
  let error: string | null = null
  let status: 'success' | 'failure' = 'success'

  try {
    assertSafePackage(pkg)
    const profile = await runUploader(['--print-profile', '--channel', pkg.browserChannelKey])
    const profileResult = safeJsonParse(profile.stdout)
    profileDir = compact(profileResult.profileDir) || null
    const channelKey = compact(profileResult.channelKey) || pkg.browserChannelKey
    const media = await verifyLocalMp4(options.mediaPath ?? mediaPathFromPackage(pkg))
    assetMissing = media.assetMissing
    draftPath = await writeDraftFile(pkg, {
      channelKey,
      mediaPath: media.mediaPath,
      draftDir: path.join(process.cwd(), 'tmp', 'mac-mini-dry-run-packages'),
    })

    if (assetMissing) {
      uploaderResult = {
        result: 'METADATA_ONLY',
        blocker: 'ASSET_MISSING',
        channelKey,
        profileDir,
        draftPath,
        asset_missing: true,
        captionPrepared: Boolean(pkg.caption),
        hashtagsPrepared: pkg.hashtags.length > 0,
        safety: {
          usesTikTokApi: false,
          storesTikTokCredentialsInRbhq: false,
          marksRbhqPublished: false,
          clicksFinalPost: false,
        },
        staging: {
          requested: false,
          uploadStaged: false,
          captionFilled: false,
          stoppedBeforeFinalPost: true,
          manualApprovalRequired: true,
        },
      }
    } else {
      const args = [
        '--draft',
        draftPath,
        '--channel',
        channelKey,
        '--timeout-ms',
        String(options.timeoutMs ?? 45_000),
        '--artifact-dir',
        options.artifactDir ?? path.join(process.cwd(), 'tmp', 'tiktok-web-upload-artifacts'),
      ]
      if (options.headless) args.push('--headless')
      if (options.stageUpload) args.push('--stage-upload')

      const dryRun = await runUploader(args)
      uploaderResult = safeJsonParse(dryRun.stdout)
      status = dryRunSucceeded(uploaderResult) ? 'success' : 'failure'
      error = status === 'failure'
        ? compact(uploaderResult.blocker) || compact(uploaderResult.error) || 'TikTok browser dry-run did not complete safely.'
        : null
    }

    await recordDryRun(fetchFn, {
      baseUrl,
      token,
      packageId: pkg.id,
      status,
      workerId,
      result: {
        source: 'mac-mini-dry-run-worker',
        packageId: pkg.id,
        channelKey: pkg.browserChannelKey,
        profileDir,
        draftPath,
        asset_missing: assetMissing,
        captionPrepared: Boolean(pkg.caption),
        hashtagsPrepared: pkg.hashtags.length > 0,
        uploaderResult,
        safety: baseSafety,
      },
      error,
    })

    return {
      result: status === 'success' ? 'PASS' : 'FAIL',
      mode: assetMissing ? 'metadata_only' : 'browser_dry_run',
      packageId: pkg.id,
      channelKey: pkg.browserChannelKey,
      profileDir,
      draftPath: options.keepDraft ? draftPath : draftPath,
      assetMissing,
      dryRunRecorded: true,
      uploaderResult,
      error,
      safety: baseSafety,
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
    await recordDryRun(fetchFn, {
      baseUrl,
      token,
      packageId: pkg.id,
      status: 'failure',
      workerId,
      result: {
        source: 'mac-mini-dry-run-worker',
        packageId: pkg.id,
        channelKey: pkg.browserChannelKey,
        profileDir,
        draftPath,
        asset_missing: assetMissing,
        error,
        safety: baseSafety,
      },
      error,
    }).catch(() => undefined)

    return {
      result: 'FAIL',
      mode: assetMissing ? 'metadata_only' : 'browser_dry_run',
      packageId: pkg.id,
      channelKey: pkg.browserChannelKey,
      profileDir,
      draftPath,
      assetMissing,
      dryRunRecorded: true,
      uploaderResult,
      error,
      safety: baseSafety,
    }
  }
}
