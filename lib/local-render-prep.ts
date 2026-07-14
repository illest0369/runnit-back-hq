import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import type { SupabaseClient } from '@supabase/supabase-js'

import { readClipPrepV1, type ClipPrepV1 } from './clip-prep'
import { attachMacMiniLocalAsset, type MacMiniClipPackage } from './mac-mini-handoff'

const execFileAsync = promisify(execFile)
const DEFAULT_MAC_MINI_ASSET_ROOT = path.join(process.cwd(), 'tmp', 'mac-mini-assets')

type LocalRenderPrepDb = Pick<SupabaseClient, 'from'>

type ClipCandidatePrepRow = {
  id: string
  title: string | null
  clip_prep: unknown
  score_breakdown: Record<string, unknown> | null
  suggested_clip_start_seconds: number | string | null
  suggested_clip_end_seconds: number | string | null
  suggested_clip_length_seconds: number | string | null
}

type MacMiniPackagePrepRow = {
  id: string
  clip_candidate_id: string
  source_url: string | null
  package_payload: Record<string, unknown> | null
}

export type LocalRenderPrepResult = {
  status: 'rendered'
  packageId: string | null
  candidateId: string
  sourcePath: string
  sourceDownloaded: boolean
  sourceDir: string
  outputPath: string
  assetRoot: string
  startSeconds: number
  endSeconds: number
  durationSeconds: number
  sizeBytes: number
  attached: boolean
  attachedPackage: MacMiniClipPackage | null
  safety: {
    downloadsVideo: boolean
    uploadsVideo: false
    postsVideo: false
    clicksFinalPost: false
    livePublish: false
  }
}

export type LocalRenderLayout = 'source' | 'vertical-blur'

export type LocalVerticalAssetRenderResult = {
  status: 'rendered'
  layout: 'vertical-blur'
  durationMode: 'source'
  packageId: string | null
  sourcePath: string
  outputPath: string
  assetRoot: string
  durationSeconds: number
  sizeBytes: number
  safety: {
    downloadsVideo: false
    uploadsVideo: false
    postsVideo: false
    clicksFinalPost: false
    livePublish: false
  }
}

export type LocalSourceAcquisitionStatus = 'source_missing' | 'download_failed' | 'render_ready'
export type LocalSourceToolName = 'yt-dlp' | 'ffmpeg' | 'ffprobe'

export type LocalSourceToolStatus = {
  name: LocalSourceToolName
  available: boolean
  version: string | null
  error: string | null
}

export type LocalSourceAcquisitionResult = {
  status: LocalSourceAcquisitionStatus
  packageId: string | null
  candidateId: string
  sourceUrl: string | null
  sourcePath: string | null
  sourceDownloaded: boolean
  assetRoot: string
  sourceDir: string
  error: string | null
  tools: LocalSourceToolStatus[]
  safety: {
    downloadsVideo: boolean
    uploadsVideo: false
    postsVideo: false
    clicksFinalPost: false
    livePublish: false
  }
}

type ResolvedPrep = {
  packageId: string | null
  candidateId: string
  candidateTitle: string
  sourceUrl: string | null
  clipPrep: ClipPrepV1 | null
  startSeconds: number
  endSeconds: number
}

type ResolvedSourceTarget = {
  packageId: string | null
  candidateId: string
  sourceUrl: string | null
}

function readNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function assetRoot(input: { assetRoot?: string | null } = {}): string {
  return path.resolve(input.assetRoot?.trim() || process.env.MAC_MINI_ASSET_ROOT?.trim() || DEFAULT_MAC_MINI_ASSET_ROOT)
}

function localSourceDir(input: { assetRoot: string; sourceDir?: string | null }): string {
  const root = path.resolve(input.assetRoot)
  const sourceDir = path.resolve(input.sourceDir?.trim() || process.env.CLIP_PREP_LOCAL_SOURCE_DIR?.trim() || path.join(root, 'source-assets'))
  if (!isPathInside(root, sourceDir)) {
    throw new Error(`Local source directory must stay inside ${root}.`)
  }
  return sourceDir
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function sanitizeFileStem(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'clip-prep'
}

function firstVersionLine(stdout: string, stderr: string): string | null {
  const text = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  return text ?? null
}

function readFirstPositiveNumber(values: Array<number | string | null | undefined>): number | null {
  for (const value of values) {
    const parsed = readNumber(value)
    if (parsed !== null && parsed > 0) return parsed
  }
  return null
}

async function readToolStatus(binary: LocalSourceToolName): Promise<LocalSourceToolStatus> {
  try {
    const { stdout, stderr } = await execFileAsync(binary, binary === 'yt-dlp' ? ['--version'] : ['-version'], { maxBuffer: 1024 * 1024 })
    return {
      name: binary,
      available: true,
      version: firstVersionLine(String(stdout), String(stderr)),
      error: null,
    }
  } catch (error) {
    return {
      name: binary,
      available: false,
      version: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function validateLocalSourceTools(): Promise<LocalSourceToolStatus[]> {
  return Promise.all([
    readToolStatus('yt-dlp'),
    readToolStatus('ffmpeg'),
    readToolStatus('ffprobe'),
  ])
}

async function requireBinary(binary: LocalSourceToolName): Promise<void> {
  const status = await readToolStatus(binary)
  if (!status.available) {
    throw new Error(`${binary} is required for local Clip Prep source acquisition/rendering.`)
  }
}

function readNestedString(value: unknown, keys: string[]): string | null {
  let cursor = value
  for (const key of keys) {
    if (!cursor || typeof cursor !== 'object') return null
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return typeof cursor === 'string' && cursor.trim() ? cursor.trim() : null
}

export async function validateLocalSourceMp4(sourcePath: string): Promise<string> {
  const clean = sourcePath.trim()
  if (!clean) {
    throw new Error('Local source MP4 path is required.')
  }
  if (isHttpUrl(clean)) {
    throw new Error('Local Clip Prep render refuses URL sources. Provide an existing local .mp4 file.')
  }
  if (!clean.toLowerCase().endsWith('.mp4')) {
    throw new Error('Local Clip Prep render source must be an .mp4 file.')
  }

  const absolute = path.resolve(clean)
  const sourceStat = await stat(absolute).catch(() => null)
  if (!sourceStat?.isFile()) {
    throw new Error(`Local source MP4 does not exist or is not a file: ${absolute}`)
  }
  if (sourceStat.size <= 0) {
    throw new Error(`Local source MP4 is empty: ${absolute}`)
  }
  return absolute
}

export function validateOutputPathInsideAssetRoot(outputPath: string, root: string): string {
  const absoluteRoot = path.resolve(root)
  const absoluteOutput = path.resolve(outputPath)
  if (!isPathInside(absoluteRoot, absoluteOutput)) {
    throw new Error(`Rendered Clip Prep output must stay inside ${absoluteRoot}.`)
  }
  if (!absoluteOutput.toLowerCase().endsWith('.mp4')) {
    throw new Error('Rendered Clip Prep output must be an .mp4 file.')
  }
  return absoluteOutput
}

async function newestMp4File(sourceDir: string, stem: string): Promise<string | null> {
  const entries = await readdir(sourceDir, { withFileTypes: true }).catch(() => [])
  const matches: Array<{ path: string; mtimeMs: number }> = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.toLowerCase().endsWith('.mp4')) continue
    if (!entry.name.startsWith(stem)) continue
    const filePath = path.join(sourceDir, entry.name)
    const fileStat = await stat(filePath).catch(() => null)
    if (fileStat?.isFile()) {
      matches.push({ path: filePath, mtimeMs: fileStat.mtimeMs })
    }
  }
  matches.sort((left, right) => right.mtimeMs - left.mtimeMs)
  return matches[0]?.path ?? null
}

async function resolveSourceMp4(input: {
  source: string
  assetRoot: string
  sourceDir?: string | null
  packageId: string | null
  candidateId: string
  downloadSource?: boolean
}): Promise<{ sourcePath: string; downloaded: boolean; sourceDir: string }> {
  const clean = input.source.trim()
  if (!clean) {
    throw new Error('Local source MP4 path or source URL is required.')
  }

  if (!isHttpUrl(clean)) {
    return {
      sourcePath: await validateLocalSourceMp4(clean),
      downloaded: false,
      sourceDir: localSourceDir({ assetRoot: input.assetRoot, sourceDir: input.sourceDir }),
    }
  }

  if (!input.downloadSource) {
    throw new Error('source_missing: Source URL requires explicit --download-source before local Clip Prep render.')
  }

  await requireBinary('yt-dlp')
  const sourceDir = localSourceDir({ assetRoot: input.assetRoot, sourceDir: input.sourceDir })
  await mkdir(sourceDir, { recursive: true })
  const stem = sanitizeFileStem([
    input.packageId ? `pkg-${input.packageId}` : null,
    `candidate-${input.candidateId}`,
    'source',
  ].filter(Boolean).join('-'))
  const outputTemplate = path.join(sourceDir, `${stem}.%(ext)s`)

  try {
    await execFileAsync(
      'yt-dlp',
      [
        '--no-playlist',
        '-f',
        'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best',
        '--merge-output-format',
        'mp4',
        '-o',
        outputTemplate,
        clean,
      ],
      { maxBuffer: 1024 * 1024 * 20 },
    )

    const downloadedPath = await newestMp4File(sourceDir, stem)
    return {
      sourcePath: await validateLocalSourceMp4(downloadedPath ?? path.join(sourceDir, `${stem}.mp4`)),
      downloaded: true,
      sourceDir,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message.startsWith('download_failed:') ? message : `download_failed: ${message}`)
  }
}

function readPrepFromPackage(row: MacMiniPackagePrepRow | null): ClipPrepV1 | null {
  return readClipPrepV1(row?.package_payload?.clipPrep)
}

function readPrepFromCandidate(row: ClipCandidatePrepRow): ClipPrepV1 | null {
  return readClipPrepV1(row.clip_prep) ?? readClipPrepV1(row.score_breakdown?.clipPrep)
}

function resolveTiming(input: { clipPrep: ClipPrepV1 | null; candidate: ClipCandidatePrepRow }): { start: number; end: number } {
  const start = readNumber(input.clipPrep?.suggested_clip_start_seconds) ?? readNumber(input.candidate.suggested_clip_start_seconds)
  const end = readNumber(input.clipPrep?.suggested_clip_end_seconds) ?? readNumber(input.candidate.suggested_clip_end_seconds)
  if (start === null || end === null || end <= start) {
    throw new Error('Clip Prep render requires suggested_clip_start_seconds and suggested_clip_end_seconds.')
  }

  const length = end - start
  if (length < 1 || length > 60) {
    throw new Error(`Clip Prep render length must be 1-60 seconds; received ${Number(length.toFixed(3))}.`)
  }

  return { start, end }
}

async function resolvePackageById(supabase: LocalRenderPrepDb, packageId: string): Promise<MacMiniPackagePrepRow> {
  const { data, error } = await supabase
    .from('mac_mini_clip_packages')
    .select('id, clip_candidate_id, source_url, package_payload')
    .eq('id', packageId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Mac mini clip package not found.')
  }
  return data as unknown as MacMiniPackagePrepRow
}

async function resolvePackageByCandidateId(supabase: LocalRenderPrepDb, candidateId: string): Promise<MacMiniPackagePrepRow | null> {
  const { data, error } = await supabase
    .from('mac_mini_clip_packages')
    .select('id, clip_candidate_id, source_url, package_payload')
    .eq('clip_candidate_id', candidateId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  return data ? data as unknown as MacMiniPackagePrepRow : null
}

async function resolveCandidate(supabase: LocalRenderPrepDb, candidateId: string): Promise<ClipCandidatePrepRow> {
  const { data, error } = await supabase
    .from('clip_candidates')
    .select('id, title, clip_prep, score_breakdown, suggested_clip_start_seconds, suggested_clip_end_seconds, suggested_clip_length_seconds')
    .eq('id', candidateId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Clip candidate not found.')
  }
  return data as unknown as ClipCandidatePrepRow
}

export async function resolveClipPrepForLocalRender(
  supabase: LocalRenderPrepDb,
  input: { packageId?: string | null; candidateId?: string | null },
): Promise<ResolvedPrep> {
  const requestedPackageId = input.packageId?.trim() || null
  const requestedCandidateId = input.candidateId?.trim() || null
  if (!requestedPackageId && !requestedCandidateId) {
    throw new Error('Use --package-id <id> or --candidate-id <id>.')
  }

  const pkg = requestedPackageId
    ? await resolvePackageById(supabase, requestedPackageId)
    : requestedCandidateId
      ? await resolvePackageByCandidateId(supabase, requestedCandidateId)
      : null
  const candidateId = requestedCandidateId || pkg?.clip_candidate_id
  if (!candidateId) {
    throw new Error('Clip candidate could not be resolved from input.')
  }

  const candidate = await resolveCandidate(supabase, candidateId)
  const clipPrep = readPrepFromPackage(pkg) ?? readPrepFromCandidate(candidate)
  const timing = resolveTiming({ clipPrep, candidate })
  return {
    packageId: pkg?.id ?? null,
    candidateId: candidate.id,
    candidateTitle: candidate.title || candidate.id,
    sourceUrl: pkg?.source_url ?? readNestedString(pkg?.package_payload, ['source', 'url']),
    clipPrep,
    startSeconds: timing.start,
    endSeconds: timing.end,
  }
}

async function resolveSourceTargetForLocalAcquisition(
  supabase: LocalRenderPrepDb,
  input: { packageId?: string | null; candidateId?: string | null },
): Promise<ResolvedSourceTarget> {
  const requestedPackageId = input.packageId?.trim() || null
  const requestedCandidateId = input.candidateId?.trim() || null
  if (!requestedPackageId && !requestedCandidateId) {
    throw new Error('Use --package-id <id> or --candidate-id <id>.')
  }

  const pkg = requestedPackageId
    ? await resolvePackageById(supabase, requestedPackageId)
    : requestedCandidateId
      ? await resolvePackageByCandidateId(supabase, requestedCandidateId)
      : null
  const candidateId = requestedCandidateId || pkg?.clip_candidate_id
  if (!candidateId) {
    throw new Error('Clip candidate could not be resolved from input.')
  }

  return {
    packageId: pkg?.id ?? null,
    candidateId,
    sourceUrl: pkg?.source_url ?? readNestedString(pkg?.package_payload, ['source', 'url']),
  }
}

export function localRenderOutputPath(input: {
  candidateId: string
  packageId?: string | null
  title?: string | null
  outputDir?: string | null
  assetRoot?: string | null
}): { assetRoot: string; outputPath: string } {
  const root = assetRoot({ assetRoot: input.assetRoot })
  const outputDir = path.resolve(input.outputDir?.trim() || root)
  if (!isPathInside(root, outputDir)) {
    throw new Error(`Clip Prep render output directory must stay inside ${root}.`)
  }

  const stem = sanitizeFileStem([
    input.packageId ? `pkg-${input.packageId}` : null,
    `candidate-${input.candidateId}`,
    input.title ?? null,
    randomUUID().slice(0, 8),
  ].filter(Boolean).join('-'))
  return {
    assetRoot: root,
    outputPath: validateOutputPathInsideAssetRoot(path.join(outputDir, `${stem}.mp4`), root),
  }
}

export function localVerticalRenderOutputPath(input: {
  sourcePath: string
  packageId?: string | null
  outputDir?: string | null
  assetRoot?: string | null
}): { assetRoot: string; outputPath: string } {
  const root = assetRoot({ assetRoot: input.assetRoot })
  const outputDir = path.resolve(input.outputDir?.trim() || path.dirname(path.resolve(input.sourcePath)))
  if (!isPathInside(root, outputDir)) {
    throw new Error(`Vertical Clip Prep output directory must stay inside ${root}.`)
  }

  const sourceStem = sanitizeFileStem(path.basename(input.sourcePath, path.extname(input.sourcePath))).slice(0, 48)
  const stem = sanitizeFileStem([
    input.packageId ? `pkg-${input.packageId}` : null,
    sourceStem,
    'vertical-1080x1920',
  ].filter(Boolean).join('-'))
  return {
    assetRoot: root,
    outputPath: validateOutputPathInsideAssetRoot(path.join(outputDir, `${stem}.mp4`), root),
  }
}

export async function acquireLocalSourceForClipPrep(
  supabase: LocalRenderPrepDb,
  input: {
    packageId?: string | null
    candidateId?: string | null
    sourcePath?: string | null
    sourceUrl?: string | null
    assetRoot?: string | null
    sourceDir?: string | null
    downloadSource?: boolean
  },
): Promise<LocalSourceAcquisitionResult> {
  const target = await resolveSourceTargetForLocalAcquisition(supabase, {
    packageId: input.packageId,
    candidateId: input.candidateId,
  })
  const root = assetRoot({ assetRoot: input.assetRoot })
  const sourceDir = localSourceDir({ assetRoot: root, sourceDir: input.sourceDir })
  const tools = await validateLocalSourceTools()
  const sourceUrl = input.sourceUrl?.trim() || target.sourceUrl || null
  const sourceInput = input.sourcePath?.trim() || sourceUrl || ''

  const missing = (message: string): LocalSourceAcquisitionResult => ({
    status: 'source_missing',
    packageId: target.packageId,
    candidateId: target.candidateId,
    sourceUrl,
    sourcePath: null,
    sourceDownloaded: false,
    assetRoot: root,
    sourceDir,
    error: message,
    tools,
    safety: {
      downloadsVideo: false,
      uploadsVideo: false,
      postsVideo: false,
      clicksFinalPost: false,
      livePublish: false,
    },
  })

  if (!sourceInput) {
    return missing('source_missing: Package/candidate does not include a source URL and no --source-path was provided.')
  }

  if (isHttpUrl(sourceInput) && !input.downloadSource) {
    return missing('source_missing: Source URL is available, but download is manual-only. Re-run with --download-source to fetch it locally.')
  }

  try {
    const source = await resolveSourceMp4({
      source: sourceInput,
      assetRoot: root,
      sourceDir,
      packageId: target.packageId,
      candidateId: target.candidateId,
      downloadSource: input.downloadSource,
    })
    return {
      status: 'render_ready',
      packageId: target.packageId,
      candidateId: target.candidateId,
      sourceUrl,
      sourcePath: source.sourcePath,
      sourceDownloaded: source.downloaded,
      assetRoot: root,
      sourceDir,
      error: null,
      tools,
      safety: {
        downloadsVideo: source.downloaded,
        uploadsVideo: false,
        postsVideo: false,
        clicksFinalPost: false,
        livePublish: false,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = isHttpUrl(sourceInput) ? 'download_failed' : 'source_missing'
    const errorMessage = message.startsWith(`${status}:`) ? message : `${status}: ${message}`
    return {
      status,
      packageId: target.packageId,
      candidateId: target.candidateId,
      sourceUrl,
      sourcePath: null,
      sourceDownloaded: false,
      assetRoot: root,
      sourceDir,
      error: errorMessage,
      tools,
      safety: {
        downloadsVideo: Boolean(isHttpUrl(sourceInput) && input.downloadSource),
        uploadsVideo: false,
        postsVideo: false,
        clicksFinalPost: false,
        livePublish: false,
      },
    }
  }
}

export async function renderLocalClipPrepMp4(input: {
  sourcePath: string
  outputPath: string
  assetRoot: string
  startSeconds: number
  endSeconds: number
  layout?: LocalRenderLayout
}): Promise<{ outputPath: string; sizeBytes: number; durationSeconds: number }> {
  await requireBinary('ffmpeg')
  await requireBinary('ffprobe')
  const sourcePath = await validateLocalSourceMp4(input.sourcePath)
  const outputPath = validateOutputPathInsideAssetRoot(input.outputPath, input.assetRoot)
  const durationSeconds = Number((input.endSeconds - input.startSeconds).toFixed(3))
  if (durationSeconds < 1 || durationSeconds > 60) {
    throw new Error(`Clip Prep render length must be 1-60 seconds; received ${durationSeconds}.`)
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  const layout = input.layout ?? 'source'
  const videoArgs = layout === 'vertical-blur'
    ? [
        '-filter_complex',
        [
          '[0:v:0]split=2[bg][fg]',
          '[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=30,eq=brightness=-0.08:saturation=1.12,setsar=1[base]',
          '[fg]scale=1080:1920:force_original_aspect_ratio=decrease,setsar=1[front]',
          '[base][front]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]',
        ].join(';'),
        '-map',
        '[v]',
      ]
    : [
        '-map',
        '0:v:0',
      ]
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-ss',
      String(input.startSeconds),
      '-i',
      sourcePath,
      '-t',
      String(durationSeconds),
      ...videoArgs,
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { maxBuffer: 1024 * 1024 * 20 },
  )

  const outputStat = await stat(outputPath)
  if (!outputStat.isFile() || outputStat.size <= 0) {
    throw new Error('ffmpeg did not produce a non-empty local Clip Prep MP4.')
  }

  return {
    outputPath,
    sizeBytes: outputStat.size,
    durationSeconds,
  }
}

export async function probeLocalMp4DurationSeconds(sourcePath: string): Promise<number> {
  await requireBinary('ffprobe')
  const absoluteSourcePath = await validateLocalSourceMp4(sourcePath)
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,duration',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      absoluteSourcePath,
    ],
    { maxBuffer: 1024 * 1024 * 2 },
  )
  const parsed = JSON.parse(String(stdout)) as {
    streams?: Array<{ codec_type?: string; duration?: string }>
    format?: { duration?: string }
  }
  const duration = readFirstPositiveNumber([
    parsed.format?.duration,
    ...(parsed.streams ?? []).map((stream) => stream.duration),
  ])
  if (duration === null) {
    throw new Error(`Could not read MP4 duration from ${absoluteSourcePath}.`)
  }
  return Number(duration.toFixed(3))
}

export async function renderLocalClipPrepVerticalAsset(input: {
  sourcePath: string
  packageId?: string | null
  assetRoot?: string | null
  outputDir?: string | null
}): Promise<LocalVerticalAssetRenderResult> {
  const sourcePath = await validateLocalSourceMp4(input.sourcePath)
  const output = localVerticalRenderOutputPath({
    sourcePath,
    packageId: input.packageId,
    outputDir: input.outputDir,
    assetRoot: input.assetRoot,
  })
  const durationSeconds = await probeLocalMp4DurationSeconds(sourcePath)
  const rendered = await renderLocalClipPrepMp4({
    sourcePath,
    outputPath: output.outputPath,
    assetRoot: output.assetRoot,
    startSeconds: 0,
    endSeconds: durationSeconds,
    layout: 'vertical-blur',
  })

  return {
    status: 'rendered',
    layout: 'vertical-blur',
    durationMode: 'source',
    packageId: input.packageId?.trim() || null,
    sourcePath,
    outputPath: rendered.outputPath,
    assetRoot: output.assetRoot,
    durationSeconds: rendered.durationSeconds,
    sizeBytes: rendered.sizeBytes,
    safety: {
      downloadsVideo: false,
      uploadsVideo: false,
      postsVideo: false,
      clicksFinalPost: false,
      livePublish: false,
    },
  }
}

export async function renderLocalClipPrepForCandidateOrPackage(
  supabase: LocalRenderPrepDb,
  input: {
    packageId?: string | null
    candidateId?: string | null
    sourcePath?: string | null
    sourceUrl?: string | null
    assetRoot?: string | null
    sourceDir?: string | null
    outputDir?: string | null
    downloadSource?: boolean
    attach?: boolean
    now?: () => Date
  },
): Promise<LocalRenderPrepResult> {
  const prep = await resolveClipPrepForLocalRender(supabase, {
    packageId: input.packageId,
    candidateId: input.candidateId,
  })
  const output = localRenderOutputPath({
    candidateId: prep.candidateId,
    packageId: prep.packageId,
    title: prep.candidateTitle,
    outputDir: input.outputDir,
    assetRoot: input.assetRoot,
  })
  const source = await resolveSourceMp4({
    source: input.sourcePath?.trim() || input.sourceUrl?.trim() || prep.sourceUrl || '',
    assetRoot: output.assetRoot,
    sourceDir: input.sourceDir,
    packageId: prep.packageId,
    candidateId: prep.candidateId,
    downloadSource: input.downloadSource,
  })
  const rendered = await renderLocalClipPrepMp4({
    sourcePath: source.sourcePath,
    outputPath: output.outputPath,
    assetRoot: output.assetRoot,
    startSeconds: prep.startSeconds,
    endSeconds: prep.endSeconds,
  })
  const shouldAttach = Boolean(input.attach)
  if (shouldAttach && !prep.packageId) {
    throw new Error('Use --package-id or render a candidate that already has a Mac mini package before --attach.')
  }
  const attachedPackage = shouldAttach && prep.packageId
    ? await attachMacMiniLocalAsset(supabase, prep.packageId, rendered.outputPath, {
        assetRoot: output.assetRoot,
        now: input.now,
      })
    : null

  return {
    status: 'rendered',
    packageId: prep.packageId,
    candidateId: prep.candidateId,
    sourcePath: source.sourcePath,
    sourceDownloaded: source.downloaded,
    sourceDir: source.sourceDir,
    outputPath: rendered.outputPath,
    assetRoot: output.assetRoot,
    startSeconds: prep.startSeconds,
    endSeconds: prep.endSeconds,
    durationSeconds: rendered.durationSeconds,
    sizeBytes: rendered.sizeBytes,
    attached: Boolean(attachedPackage),
    attachedPackage,
    safety: {
      downloadsVideo: source.downloaded,
      uploadsVideo: false,
      postsVideo: false,
      clicksFinalPost: false,
      livePublish: false,
    },
  }
}
