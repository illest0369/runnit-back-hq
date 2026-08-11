import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  GoogleGenAI,
  type File as GeminiFile,
  type Part,
} from '@google/genai'
import { z } from 'zod'

import { buildClipPrepV1, type CaptionPrepV1 } from './clip-prep'
import {
  type LocalRenderLayout,
  renderLocalClipPrepMp4,
  renderLocalClipPrepVerticalAsset,
  validateRenderedMp4Quality,
  type LocalRenderQualityValidation,
} from './local-render-prep'
import {
  attachMacMiniLocalAsset,
  createMacMiniClipPackageFromCandidate,
} from './mac-mini-handoff'
import { getMetricoolWorkflowClips } from './moderation-queue'
import { createPlatformReadyPackageFromMacMini } from './platform-package-bridge'
import {
  RB_WOMEN_MOMENT_TYPES,
  RB_WOMEN_REJECTION_CODES,
  evaluateRBWomenCandidates,
  resolveRBWomenSourceRecord,
  type RBWomenCandidateEvaluation,
  type RBWomenEditorialCandidateInput,
  type RBWomenRejectionCode,
} from './rb-women-channel-profile'
import { RB_WOMEN_CHANNEL_ID } from './rb-women-source-config'
import { readTimedSegments } from './tiktok-clip-scout'

const execFileAsync = promisify(execFile)
const DEFAULT_ASSET_ROOT = path.join(process.cwd(), 'tmp', 'rb-women-opus')
const SOURCE_CHANNEL_KEY = 'rb_women_opus_adapter'
const SOURCE_DISPLAY_NAME = 'RB Women Opus Adapter'
const TARGET_CLIPS = 3
const MIN_DURATION_SECONDS = 20
const MAX_DURATION_SECONDS = 60
const MIN_SELECTION_SCORE = 78
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_VIDEO_MODEL || 'gemini-3.6-flash'
const DEFAULT_GEMINI_FILE_POLL_INTERVAL_MS = 5_000
const DEFAULT_GEMINI_FILE_PROCESSING_TIMEOUT_MS = 1_800_000

type OpusDb = SupabaseClient

type GeminiFileMetadata = {
  name?: string
  uri?: string
  mimeType?: string
  state?: string
  error?: {
    message?: string
    code?: number
  }
}

type GeminiFilesApi = {
  get(params: { name: string }): Promise<GeminiFileMetadata>
  delete(params: { name: string }): Promise<unknown>
}

export type OpusSourceInput = {
  source: string
  title?: string | null
  assetRoot?: string | null
  writeReport?: boolean
  runId?: string | null
}

export type PreparedOpusSource = {
  input: string
  inputKind: 'youtube_url' | 'public_mp4_url' | 'local_mp4'
  sourcePath: string
  sourceDownloaded: boolean
  metadata: {
    title: string
    description: string | null
    durationSeconds: number | null
    thumbnailUrl: string | null
    publishedAt: string | null
    platform: 'youtube' | 'r2_mp4' | 'local_video'
    externalVideoId: string
    videoUrl: string
  }
}

export type GeminiOpusCandidate = RBWomenEditorialCandidateInput & {
  start_seconds: number
  end_seconds: number
  transcript_summary: string
  opening_line: string
  subject: string
  visual_context: string
  rb_women_angle: string
  viral_reason: string
  confidence: number
}

export type SelectedOpusCandidate = GeminiOpusCandidate & {
  editorial: RBWomenCandidateEvaluation
  rank: number
  paddedStartSeconds: number
  paddedEndSeconds: number
  sceneAdjustedStartSeconds: number
  sceneAdjustedEndSeconds: number
  boundaryAdjustment?: {
    originalStartSeconds: number
    originalEndSeconds: number
    refinedStartSeconds: number
    refinedEndSeconds: number
    reason: string
  } | null
}

export type WhisperXWord = {
  start: number
  end: number
  word: string
  score?: number | null
}

export type WhisperXTranscript = {
  text: string
  words: WhisperXWord[]
  segments: Array<{ start: number; end: number; text: string }>
  language: string | null
  adapterStatus: 'ok'
}

export type OpusClipResult = {
  rank: number
  stage?: 'discovered' | 'analyzed' | 'selected' | 'cut' | 'rendered' | 'uploaded' | 'packaged' | 'queue_ready' | 'scheduled' | 'failed'
  candidateId: string | null
  packageId: string | null
  clipId: string | null
  localCutPath: string | null
  localVerticalPath: string | null
  publicUrl: string | null
  queueEligible: boolean
  quality: LocalRenderQualityValidation | null
  selected: SelectedOpusCandidate
  captionAccuracy: 'word_timed_whisperx' | 'failed'
  verticalCropQuality: 'clipsai_dynamic' | 'ffmpeg_vertical_blur_fallback' | 'ffmpeg_subject_aware_center_crop' | 'failed'
  publishableWithoutManualEditing: boolean
  failure: string | null
}

export type OpusRunReport = {
  result: 'PASS' | 'FAIL'
  source: PreparedOpusSource['metadata']
  geminiCandidatesReturned: number
  eligibleCandidates: number
  rejectedCandidates: Array<{
    startSeconds: number
    endSeconds: number
    subject: string
    competition: string
    rejectionCodes: RBWomenRejectionCode[]
    reason: string
  }>
  clipsSelected: number
  clips: OpusClipResult[]
  processingTimeSeconds: number
  reportPath: string | null
  adapterStatus: {
    gemini: 'ok' | 'failed'
    ffmpeg: 'ok' | 'failed'
    whisperx: 'ok' | 'missing' | 'failed'
    scenedetect: 'ok' | 'missing' | 'failed'
    clipsai: 'ok' | 'missing_or_incompatible'
    renderer: 'existing_local_renderer'
    rbhqPipeline: 'ok' | 'failed'
  }
  safety: {
    callsMetricoolSchedule: false
    postsToSocialPlatforms: false
    uploadsToSocialPlatforms: false
    uploadsToR2: boolean
  }
}

const GeminiCandidateSchema = z.object({
  start_seconds: z.number(),
  end_seconds: z.number(),
  transcript_summary: z.string(),
  opening_line: z.string(),
  subject: z.string(),
  visual_context: z.string(),
  rb_women_angle: z.string(),
  viral_reason: z.string(),
  confidence: z.number().min(0).max(1),
  womens_basketball_primary_subject: z.boolean(),
  competition: z.string(),
  primary_subject_type: z.string(),
  primary_subject_names: z.array(z.string()),
  team_names: z.array(z.string()),
  player_names: z.array(z.string()),
  coach_names: z.array(z.string()),
  event_type: z.string(),
  moment_type: z.enum(RB_WOMEN_MOMENT_TYPES),
  rb_women_lanes: z.array(z.string()),
  standalone_context: z.boolean(),
  why_fans_care: z.string(),
  audience_fit_reason: z.string(),
  source_reliability: z.number().min(0).max(100),
  timeliness: z.number().min(0).max(100),
  visual_action_score: z.number().min(0).max(100),
  emotional_stakes_score: z.number().min(0).max(100),
  debate_score: z.number().min(0).max(100),
  personality_score: z.number().min(0).max(100),
  undercovered_story_score: z.number().min(0).max(100),
  editorial_fit_score: z.number().min(0).max(100),
  eligibility: z.boolean(),
  rejection_codes: z.array(z.enum(RB_WOMEN_REJECTION_CODES)),
})

const GeminiResponseSchema = z.object({
  candidates: z.array(GeminiCandidateSchema).min(1).max(8),
})

const GEMINI_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          start_seconds: { type: 'number' },
          end_seconds: { type: 'number' },
          transcript_summary: { type: 'string' },
          opening_line: { type: 'string' },
          subject: { type: 'string' },
          visual_context: { type: 'string' },
          rb_women_angle: { type: 'string' },
          viral_reason: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          womens_basketball_primary_subject: { type: 'boolean' },
          competition: { type: 'string' },
          primary_subject_type: { type: 'string' },
          primary_subject_names: { type: 'array', items: { type: 'string' } },
          team_names: { type: 'array', items: { type: 'string' } },
          player_names: { type: 'array', items: { type: 'string' } },
          coach_names: { type: 'array', items: { type: 'string' } },
          event_type: { type: 'string' },
          moment_type: { type: 'string', enum: [...RB_WOMEN_MOMENT_TYPES] },
          rb_women_lanes: { type: 'array', items: { type: 'string' } },
          standalone_context: { type: 'boolean' },
          why_fans_care: { type: 'string' },
          audience_fit_reason: { type: 'string' },
          source_reliability: { type: 'number', minimum: 0, maximum: 100 },
          timeliness: { type: 'number', minimum: 0, maximum: 100 },
          visual_action_score: { type: 'number', minimum: 0, maximum: 100 },
          emotional_stakes_score: { type: 'number', minimum: 0, maximum: 100 },
          debate_score: { type: 'number', minimum: 0, maximum: 100 },
          personality_score: { type: 'number', minimum: 0, maximum: 100 },
          undercovered_story_score: { type: 'number', minimum: 0, maximum: 100 },
          editorial_fit_score: { type: 'number', minimum: 0, maximum: 100 },
          eligibility: { type: 'boolean' },
          rejection_codes: { type: 'array', items: { type: 'string', enum: [...RB_WOMEN_REJECTION_CODES] } },
        },
        required: [
          'start_seconds',
          'end_seconds',
          'transcript_summary',
          'opening_line',
          'subject',
          'visual_context',
          'rb_women_angle',
          'viral_reason',
          'confidence',
          'womens_basketball_primary_subject',
          'competition',
          'primary_subject_type',
          'primary_subject_names',
          'team_names',
          'player_names',
          'coach_names',
          'event_type',
          'moment_type',
          'rb_women_lanes',
          'standalone_context',
          'why_fans_care',
          'audience_fit_reason',
          'source_reliability',
          'timeliness',
          'visual_action_score',
          'emotional_stakes_score',
          'debate_score',
          'personality_score',
          'undercovered_story_score',
          'editorial_fit_score',
          'eligibility',
          'rejection_codes',
        ],
      },
    },
  },
  required: ['candidates'],
}

function compact(value: string | null | undefined, maxLength = 500): string {
  const clean = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 3).trim()}...`
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function parseYouTubeId(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] ?? null
    if (url.searchParams.get('v')) return url.searchParams.get('v')
    return url.pathname.match(/\/(?:shorts|live|embed)\/([^/?#]+)/)?.[1] ?? null
  } catch {
    return null
  }
}

function sanitizeStem(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'rb-women-opus'
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(3))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientGeminiGenerateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /503|UNAVAILABLE|high demand|temporar/i.test(message)
}

async function generateGeminiContentWithRetry<T>(
  request: () => Promise<T>,
  input: { retries?: number; delayMs?: number; log?: (status: 'generate_retry') => void } = {},
): Promise<T> {
  const retries = input.retries ?? 2
  const delayMs = input.delayMs ?? 10_000
  let lastError: unknown = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await request()
    } catch (error) {
      lastError = error
      if (attempt >= retries || !isTransientGeminiGenerateError(error)) throw error
      input.log?.('generate_retry')
      await sleep(delayMs)
    }
  }
  throw lastError
}

function geminiFileState(file: GeminiFileMetadata): string {
  return typeof file.state === 'string' ? file.state : ''
}

function geminiFileErrorMessage(file: GeminiFileMetadata): string {
  const message = file.error?.message
  return typeof message === 'string' && message.trim()
    ? message.replace(/\s+/g, ' ').trim()
    : 'Gemini file processing failed.'
}

async function requireBinary(binary: 'ffmpeg' | 'ffprobe' | 'yt-dlp'): Promise<void> {
  try {
    await execFileAsync(binary, binary === 'yt-dlp' ? ['--version'] : ['-version'], {
      maxBuffer: 1024 * 1024,
    })
  } catch {
    throw new Error(`${binary} is required for RB Women Opus processing.`)
  }
}

function pythonBinary(): string {
  return process.env.RB_WOMEN_OPUS_PYTHON?.trim() || 'python3'
}

async function optionalCommand(args: string[]): Promise<boolean> {
  try {
    await execFileAsync(args[0] ?? '', args.slice(1), { maxBuffer: 1024 * 1024 })
    return true
  } catch {
    return false
  }
}

async function probeDurationSeconds(filePath: string): Promise<number | null> {
  await requireBinary('ffprobe')
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', filePath],
    { maxBuffer: 1024 * 1024 },
  )
  const parsed = JSON.parse(stdout) as { format?: { duration?: string } }
  const duration = Number(parsed.format?.duration)
  return Number.isFinite(duration) ? roundSeconds(duration) : null
}

async function ensureLocalMp4(filePath: string): Promise<string> {
  const absolute = path.resolve(filePath)
  const fileStat = await stat(absolute)
  if (!fileStat.isFile() || fileStat.size <= 0) {
    throw new Error(`Local source MP4 is not a non-empty file: ${absolute}`)
  }
  if (!absolute.toLowerCase().endsWith('.mp4')) {
    throw new Error(`Local source must be an MP4 for this adapter: ${absolute}`)
  }
  return absolute
}

async function downloadPublicMp4(sourceUrl: string, outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true })
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(`Public MP4 download failed with HTTP ${response.status}.`)
  }
  const outputPath = path.join(outputDir, `source-${hashText(sourceUrl)}.mp4`)
  const bytes = Buffer.from(await response.arrayBuffer())
  await writeFile(outputPath, bytes)
  return ensureLocalMp4(outputPath)
}

async function readYouTubeMetadata(sourceUrl: string): Promise<PreparedOpusSource['metadata']> {
  await requireBinary('yt-dlp')
  const { stdout } = await execFileAsync(
    'yt-dlp',
    ['--dump-single-json', '--no-playlist', '--skip-download', sourceUrl],
    { maxBuffer: 1024 * 1024 * 8 },
  )
  const parsed = JSON.parse(stdout) as {
    id?: string
    title?: string
    description?: string
    duration?: number
    thumbnail?: string
    upload_date?: string
    timestamp?: number
  }
  const publishedAt = parsed.timestamp
    ? new Date(parsed.timestamp * 1000).toISOString()
    : parsed.upload_date?.match(/^\d{8}$/)
      ? `${parsed.upload_date.slice(0, 4)}-${parsed.upload_date.slice(4, 6)}-${parsed.upload_date.slice(6, 8)}T00:00:00.000Z`
      : null
  return {
    title: compact(parsed.title, 180) || `RB Women source ${parseYouTubeId(sourceUrl) ?? hashText(sourceUrl)}`,
    description: compact(parsed.description, 2000) || null,
    durationSeconds: typeof parsed.duration === 'number' ? Math.round(parsed.duration) : null,
    thumbnailUrl: parsed.thumbnail ?? null,
    publishedAt,
    platform: 'youtube',
    externalVideoId: parsed.id || parseYouTubeId(sourceUrl) || `url-${hashText(sourceUrl)}`,
    videoUrl: sourceUrl,
  }
}

async function downloadYouTubeMp4(sourceUrl: string, outputDir: string): Promise<string> {
  await requireBinary('yt-dlp')
  await mkdir(outputDir, { recursive: true })
  const stem = sanitizeStem(`source-${parseYouTubeId(sourceUrl) ?? hashText(sourceUrl)}`)
  const outputTemplate = path.join(outputDir, `${stem}.%(ext)s`)
  await execFileAsync(
    'yt-dlp',
    [
      '--no-playlist',
      '--merge-output-format',
      'mp4',
      '-f',
      'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best',
      '-o',
      outputTemplate,
      sourceUrl,
    ],
    { maxBuffer: 1024 * 1024 * 20 },
  )
  return ensureLocalMp4(path.join(outputDir, `${stem}.mp4`))
}

export class OpusSourceAdapter {
  async prepare(input: OpusSourceInput): Promise<PreparedOpusSource> {
    const source = input.source.trim()
    const assetRoot = path.resolve(input.assetRoot ?? DEFAULT_ASSET_ROOT)
    const sourceDir = path.join(assetRoot, 'sources')
    await mkdir(sourceDir, { recursive: true })

    if (!isHttpUrl(source)) {
      const sourcePath = await ensureLocalMp4(source)
      const durationSeconds = await probeDurationSeconds(sourcePath)
      return {
        input: source,
        inputKind: 'local_mp4',
        sourcePath,
        sourceDownloaded: false,
        metadata: {
          title: compact(input.title, 180) || path.basename(sourcePath),
          description: null,
          durationSeconds,
          thumbnailUrl: null,
          publishedAt: null,
          platform: 'local_video',
          externalVideoId: `local-${hashText(sourcePath)}`,
          videoUrl: sourcePath,
        },
      }
    }

    const youtubeId = parseYouTubeId(source)
    if (youtubeId) {
      const sourceRecord = resolveRBWomenSourceRecord(source)
      if (sourceRecord?.rightsMode === 'discovery_only') {
        throw new Error(`RB Women source ${sourceRecord.channelName} is discovery_only and cannot be automatically downloaded or re-rendered.`)
      }
      const [metadata, sourcePath] = await Promise.all([
        readYouTubeMetadata(source),
        downloadYouTubeMp4(source, sourceDir),
      ])
      return {
        input: source,
        inputKind: 'youtube_url',
        sourcePath,
        sourceDownloaded: true,
        metadata: {
          ...metadata,
          title: compact(input.title, 180) || metadata.title,
        },
      }
    }

    const sourcePath = await downloadPublicMp4(source, sourceDir)
    const durationSeconds = await probeDurationSeconds(sourcePath)
    return {
      input: source,
      inputKind: 'public_mp4_url',
      sourcePath,
      sourceDownloaded: true,
      metadata: {
        title: compact(input.title, 180) || `RB Women public MP4 ${hashText(source)}`,
        description: null,
        durationSeconds,
        thumbnailUrl: null,
        publishedAt: null,
        platform: 'r2_mp4',
        externalVideoId: `mp4-${hashText(source)}`,
        videoUrl: source,
      },
    }
  }
}

export class GeminiVideoUnderstandingAdapter {
  async requestCandidates(source: PreparedOpusSource): Promise<GeminiOpusCandidate[]> {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for Gemini video understanding.')
    }

    const ai = new GoogleGenAI({ apiKey })
    let uploadedFileName: string | null = null

    try {
      const uploadedFile = await ai.files.upload({
        file: source.sourcePath,
        config: { mimeType: 'video/mp4', displayName: source.metadata.title },
      }) as GeminiFile
      uploadedFileName = uploadedFile.name ?? null
      console.error('[rb-women-opus] gemini_file:uploaded')
      if (!uploadedFileName) {
        throw new Error('Gemini file upload did not return a file name.')
      }
      if (!uploadedFile.uri) {
        throw new Error('Gemini file upload did not return a file URI.')
      }

      const activeFile = await waitForGeminiFileActive({
        files: ai.files,
        fileName: uploadedFileName,
        pollIntervalMs: readPositiveIntegerEnv('GEMINI_FILE_POLL_INTERVAL_MS', DEFAULT_GEMINI_FILE_POLL_INTERVAL_MS),
        timeoutMs: readPositiveIntegerEnv('GEMINI_FILE_PROCESSING_TIMEOUT_MS', DEFAULT_GEMINI_FILE_PROCESSING_TIMEOUT_MS),
        log: (status) => console.error(`[rb-women-opus] gemini_file:${status}`),
      })
      const prompt = buildGeminiPrompt(source)
      const parts: Part[] = [
        {
          fileData: {
            fileUri: activeFile.uri || uploadedFile.uri,
            mimeType: activeFile.mimeType || uploadedFile.mimeType || 'video/mp4',
          },
        },
        { text: prompt },
      ]
      const response = await generateGeminiContentWithRetry(
        () => ai.models.generateContent({
          model: DEFAULT_GEMINI_MODEL,
          contents: parts,
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: GEMINI_RESPONSE_JSON_SCHEMA,
          },
        }),
        { log: (status) => console.error(`[rb-women-opus] gemini_file:${status}`) },
      )
      const text = response.text
      if (!text) throw new Error('Gemini returned an empty candidate response.')
      const parsed = GeminiResponseSchema.parse(JSON.parse(text))
      return parsed.candidates
    } finally {
      if (uploadedFileName) {
        try {
          await ai.files.delete({ name: uploadedFileName })
        } catch {
          console.error('[rb-women-opus] gemini_file:delete_failed')
        }
      }
    }
  }
}

export async function waitForGeminiFileActive(input: {
  files: Pick<GeminiFilesApi, 'get'>
  fileName: string
  pollIntervalMs?: number
  timeoutMs?: number
  now?: () => number
  sleepFn?: (ms: number) => Promise<void>
  log?: (status: 'processing' | 'active' | 'failed' | 'timeout') => void
}): Promise<GeminiFileMetadata> {
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_GEMINI_FILE_POLL_INTERVAL_MS
  const timeoutMs = input.timeoutMs ?? DEFAULT_GEMINI_FILE_PROCESSING_TIMEOUT_MS
  const now = input.now ?? (() => Date.now())
  const sleepFn = input.sleepFn ?? sleep
  const startedAt = now()

  while (true) {
    const file = await input.files.get({ name: input.fileName })
    const state = geminiFileState(file)

    if (state === 'ACTIVE') {
      input.log?.('active')
      return file
    }
    if (state === 'FAILED') {
      input.log?.('failed')
      throw new Error(`Gemini file processing failed: ${geminiFileErrorMessage(file)}`)
    }
    if (now() - startedAt >= timeoutMs) {
      input.log?.('timeout')
      throw new Error(`Gemini file processing timeout after ${timeoutMs}ms.`)
    }

    input.log?.('processing')
    await sleepFn(pollIntervalMs)
  }
}

function buildGeminiPrompt(source: PreparedOpusSource): string {
  return [
    'You are an RBHQ RB Women clip producer selecting Opus-style short-form moments.',
    'Analyze this long-form women sports interview, podcast, press conference, or studio discussion video.',
    'Return strict JSON only. No markdown. No prose outside JSON.',
    'Request: return 6 to 8 timestamped clip candidates.',
    'Each candidate must be 20 to 60 seconds, understandable alone, and suitable for a 9:16 captioned short.',
    'Hard editorial rule: RB Women means women’s basketball. The actual primary subject must be a women’s basketball player, coach, team, league, game, tournament, or labor/business/media issue specifically involving women’s basketball.',
    'Hard reject men’s sports, NBA-only material, men’s college basketball, bowling, generic sports interviews, female reporters covering male athletes, female hosts discussing unrelated sports, generic women’s sports that is not basketball, sponsor reads, commercials, and candidates with no identifiable women’s basketball subject.',
    'The model must identify the actual subject. A female journalist interviewing a male athlete is not women’s basketball.',
    'Allowed competitions for eligible clips: WNBA, NCAAW, Unrivaled, FIBA_WOMEN, WOMENS_PRO_BASKETBALL, GIRLS_ELITE_BASKETBALL, WOMENS_BASKETBALL_HISTORY.',
    'Use rejection_codes for ineligible candidates. If the source is men’s competition with a female reporter or host, use REJECT_MENS_COMPETITION or REJECT_ADJACENT_WOMAN_ONLY.',
    'Score for women’s basketball subject strength, clear argument or quote, recognizable player/team/competition, controversy/debate, cultural angle, strong standalone opening, and usable duration.',
    'Voice and copy should be fan-first, direct, culturally aware, search optimized, and not broadcaster or corporate empowerment copy.',
    'Required JSON shape: {"candidates":[{"start_seconds":number,"end_seconds":number,"transcript_summary":"string","opening_line":"string","subject":"string","visual_context":"string","rb_women_angle":"string","viral_reason":"string","confidence":0.0,"womens_basketball_primary_subject":boolean,"competition":"string","primary_subject_type":"string","primary_subject_names":["string"],"team_names":["string"],"player_names":["string"],"coach_names":["string"],"event_type":"string","moment_type":"press_conference_quote","rb_women_lanes":["string"],"standalone_context":boolean,"why_fans_care":"string","audience_fit_reason":"string","source_reliability":0,"timeliness":0,"visual_action_score":0,"emotional_stakes_score":0,"debate_score":0,"personality_score":0,"undercovered_story_score":0,"editorial_fit_score":0,"eligibility":boolean,"rejection_codes":["REJECT_NO_WBB_ENTITY"]}]}',
    `Source title: ${source.metadata.title}`,
    `Source duration seconds: ${source.metadata.durationSeconds ?? 'unknown'}`,
    `Source URL/reference: ${source.metadata.videoUrl}`,
  ].join('\n')
}

export class CandidateSelectorAdapter {
  select(evaluations: RBWomenCandidateEvaluation[], durationSeconds: number | null): SelectedOpusCandidate[] {
    const ordered = evaluations
      .map((evaluation) => {
        const candidate = normalizeGeminiCandidate(evaluation.candidate as GeminiOpusCandidate, durationSeconds)
        return candidate ? { candidate, evaluation } : null
      })
      .filter((item): item is { candidate: GeminiOpusCandidate; evaluation: RBWomenCandidateEvaluation } => Boolean(item))
      .filter((item) => {
        const duration = item.candidate.end_seconds - item.candidate.start_seconds
        return duration >= MIN_DURATION_SECONDS && duration <= MAX_DURATION_SECONDS && item.evaluation.score >= MIN_SELECTION_SCORE
      })
      .sort((left, right) => right.evaluation.score - left.evaluation.score || right.candidate.confidence - left.candidate.confidence)

    const selected: SelectedOpusCandidate[] = []
    for (const { candidate, evaluation } of ordered) {
      if (selected.some((existing) => overlaps(candidate, existing))) continue
      const paddedStartSeconds = clamp(candidate.start_seconds - 1.5, 0, durationSeconds ?? candidate.start_seconds)
      const paddedEndSeconds = durationSeconds === null
        ? candidate.end_seconds + 1.5
        : clamp(candidate.end_seconds + 1.5, paddedStartSeconds + 1, durationSeconds)
      selected.push({
        ...candidate,
        editorial: evaluation,
        rank: selected.length + 1,
        paddedStartSeconds: roundSeconds(paddedStartSeconds),
        paddedEndSeconds: roundSeconds(paddedEndSeconds),
        sceneAdjustedStartSeconds: roundSeconds(paddedStartSeconds),
        sceneAdjustedEndSeconds: roundSeconds(paddedEndSeconds),
      })
      if (selected.length >= TARGET_CLIPS) break
    }
    return selected
  }
}

function normalizeGeminiCandidate(candidate: GeminiOpusCandidate, durationSeconds: number | null): GeminiOpusCandidate | null {
  const start = Number(candidate.start_seconds)
  const end = Number(candidate.end_seconds)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  const boundedStart = clamp(start, 0, durationSeconds ?? start)
  const boundedEnd = durationSeconds === null ? end : clamp(end, boundedStart + 1, durationSeconds)
  return {
    ...candidate,
    start_seconds: roundSeconds(boundedStart),
    end_seconds: roundSeconds(boundedEnd),
    transcript_summary: compact(candidate.transcript_summary, 500),
    opening_line: compact(candidate.opening_line, 180),
    subject: compact(candidate.subject, 180),
    visual_context: compact(candidate.visual_context, 260),
    rb_women_angle: compact(candidate.rb_women_angle, 260),
    viral_reason: compact(candidate.viral_reason, 260),
    confidence: clamp(candidate.confidence, 0, 1),
    womens_basketball_primary_subject: Boolean(candidate.womens_basketball_primary_subject),
    competition: compact(candidate.competition, 80),
    primary_subject_type: compact(candidate.primary_subject_type, 80),
    primary_subject_names: stringArray(candidate.primary_subject_names).slice(0, 8),
    team_names: stringArray(candidate.team_names).slice(0, 8),
    player_names: stringArray(candidate.player_names).slice(0, 8),
    coach_names: stringArray(candidate.coach_names).slice(0, 8),
    event_type: compact(candidate.event_type, 80),
    moment_type: candidate.moment_type,
    rb_women_lanes: stringArray(candidate.rb_women_lanes).slice(0, 4),
    standalone_context: Boolean(candidate.standalone_context),
    why_fans_care: compact(candidate.why_fans_care, 260),
    audience_fit_reason: compact(candidate.audience_fit_reason, 260),
    source_reliability: clamp(candidate.source_reliability, 0, 100),
    timeliness: clamp(candidate.timeliness, 0, 100),
    visual_action_score: clamp(candidate.visual_action_score, 0, 100),
    emotional_stakes_score: clamp(candidate.emotional_stakes_score, 0, 100),
    debate_score: clamp(candidate.debate_score, 0, 100),
    personality_score: clamp(candidate.personality_score, 0, 100),
    undercovered_story_score: clamp(candidate.undercovered_story_score, 0, 100),
    editorial_fit_score: clamp(candidate.editorial_fit_score, 0, 100),
    eligibility: Boolean(candidate.eligibility),
    rejection_codes: rejectionCodeArray(candidate.rejection_codes),
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => compact(item, 100))
    : []
}

function rejectionCodeArray(value: unknown): RBWomenRejectionCode[] {
  return Array.isArray(value)
    ? value.filter((item): item is RBWomenRejectionCode => RB_WOMEN_REJECTION_CODES.includes(item as RBWomenRejectionCode))
    : []
}

function overlaps(left: GeminiOpusCandidate, right: GeminiOpusCandidate): boolean {
  return left.start_seconds < right.end_seconds && right.start_seconds < left.end_seconds
}

export class PySceneDetectAdapter {
  async adjustRange(sourcePath: string, candidate: SelectedOpusCandidate): Promise<SelectedOpusCandidate> {
    const python = pythonBinary()
    const available = await optionalCommand([python, '-c', 'import scenedetect'])
    if (!available) {
      throw new Error('PySceneDetect is not installed. Install pinned requirements-rb-women-opus.txt.')
    }
    const script = [
      'import json, sys',
      'from scenedetect import open_video, SceneManager',
      'from scenedetect.detectors import ContentDetector',
      'video=open_video(sys.argv[1])',
      'manager=SceneManager()',
      'manager.add_detector(ContentDetector())',
      'manager.detect_scenes(video, show_progress=False)',
      'scenes=manager.get_scene_list()',
      'print(json.dumps([[s.get_seconds(), e.get_seconds()] for s,e in scenes]))',
    ].join('\n')
    const { stdout } = await execFileAsync(python, ['-c', script, sourcePath], {
      maxBuffer: 1024 * 1024 * 4,
    })
    const scenes = JSON.parse(stdout || '[]') as Array<[number, number]>
    const adjustedStart = nearestBoundary(candidate.paddedStartSeconds, scenes.flatMap((scene) => scene), 1.2)
    const adjustedEnd = nearestBoundary(candidate.paddedEndSeconds, scenes.flatMap((scene) => scene), 1.2)
    if (adjustedEnd - adjustedStart < MIN_DURATION_SECONDS || adjustedEnd - adjustedStart > MAX_DURATION_SECONDS + 4) {
      return candidate
    }
    return {
      ...candidate,
      sceneAdjustedStartSeconds: roundSeconds(adjustedStart),
      sceneAdjustedEndSeconds: roundSeconds(adjustedEnd),
    }
  }
}

function nearestBoundary(value: number, boundaries: number[], toleranceSeconds: number): number {
  let best = value
  let bestDelta = toleranceSeconds
  for (const boundary of boundaries) {
    const delta = Math.abs(boundary - value)
    if (delta < bestDelta) {
      best = boundary
      bestDelta = delta
    }
  }
  return best
}

export class FFmpegClipAdapter {
  async cut(input: {
    sourcePath: string
    outputPath: string
    assetRoot: string
    startSeconds: number
    endSeconds: number
  }): Promise<{ outputPath: string; quality: LocalRenderQualityValidation }> {
    await requireBinary('ffmpeg')
    await mkdir(path.dirname(input.outputPath), { recursive: true })
    const rendered = await renderLocalClipPrepMp4({
      sourcePath: input.sourcePath,
      outputPath: input.outputPath,
      assetRoot: input.assetRoot,
      startSeconds: input.startSeconds,
      endSeconds: input.endSeconds,
      layout: 'source',
    })
    return { outputPath: rendered.outputPath, quality: rendered.qualityValidation }
  }
}

export class WhisperXAdapter {
  async transcribe(input: {
    clipPath: string
    outputDir: string
    model?: string | null
  }): Promise<WhisperXTranscript> {
    const python = pythonBinary()
    const available = await optionalCommand([python, '-c', 'import whisperx'])
    if (!available) {
      throw new Error('WhisperX is not installed. Install pinned requirements-rb-women-opus.txt.')
    }
    await mkdir(input.outputDir, { recursive: true })
    const model = input.model?.trim() || process.env.RB_WOMEN_OPUS_WHISPERX_MODEL?.trim() || 'base'
    await execFileAsync(
      python,
      [
        '-m',
        'whisperx',
        input.clipPath,
        '--model',
        model,
        '--device',
        'cpu',
        '--compute_type',
        'int8',
        '--output_format',
        'json',
        '--output_dir',
        input.outputDir,
      ],
      { maxBuffer: 1024 * 1024 * 20 },
    )
    const jsonPath = path.join(input.outputDir, `${path.basename(input.clipPath, path.extname(input.clipPath))}.json`)
    const parsed = JSON.parse(await readFile(jsonPath, 'utf8')) as {
      language?: string
      segments?: Array<{
        start?: number
        end?: number
        text?: string
        words?: Array<{ start?: number; end?: number; word?: string; score?: number }>
      }>
    }
    const segments = (parsed.segments ?? []).flatMap((segment) => {
      const start = Number(segment.start)
      const end = Number(segment.end)
      const text = compact(segment.text, 300)
      return Number.isFinite(start) && Number.isFinite(end) && end > start && text
        ? [{ start: roundSeconds(start), end: roundSeconds(end), text }]
        : []
    })
    const words = (parsed.segments ?? []).flatMap((segment) => segment.words ?? []).flatMap((word) => {
      const start = Number(word.start)
      const end = Number(word.end)
      const text = compact(word.word, 40)
      return Number.isFinite(start) && Number.isFinite(end) && end > start && text
        ? [{ start: roundSeconds(start), end: roundSeconds(end), word: text, score: word.score ?? null }]
        : []
    })
    return {
      text: compact(segments.map((segment) => segment.text).join(' '), 5000),
      words,
      segments: segments.length > 0 ? segments : wordSegments(words),
      language: parsed.language ?? null,
      adapterStatus: 'ok',
    }
  }
}

function wordSegments(words: WhisperXWord[]): Array<{ start: number; end: number; text: string }> {
  const segments: Array<{ start: number; end: number; text: string }> = []
  let current: WhisperXWord[] = []
  for (const word of words) {
    current.push(word)
    const start = current[0]?.start ?? word.start
    if (current.length >= 7 || word.end - start >= 2.2) {
      segments.push({
        start: roundSeconds(start),
        end: roundSeconds(word.end),
        text: compact(current.map((item) => item.word).join(' '), 120),
      })
      current = []
    }
  }
  if (current.length > 0) {
    segments.push({
      start: current[0]?.start ?? 0,
      end: current[current.length - 1]?.end ?? 0,
      text: compact(current.map((item) => item.word).join(' '), 120),
    })
  }
  return segments
}

function normalizedWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function findOpeningWordOffset(words: WhisperXWord[], openingLine: string): number | null {
  const opening = normalizedWords(openingLine).slice(0, 4)
  if (opening.length < 2 || words.length < opening.length) return null
  const wordTexts = words.map((word) => normalizedWords(word.word)[0] ?? '')
  for (let index = 0; index <= wordTexts.length - opening.length; index += 1) {
    const matches = opening.every((token, offset) => wordTexts[index + offset] === token)
    if (matches) return words[index]?.start ?? null
  }
  return null
}

function speechLedMoment(candidate: SelectedOpusCandidate): boolean {
  return [
    'press_conference_quote',
    'player_reaction',
    'coach_reaction',
    'personal_story',
    'funny_personality',
    'behind_the_scenes',
    'labor_or_business',
    'media_coverage',
    'leadership',
    'tactical_insight',
  ].includes(candidate.moment_type)
}

function trimTranscript(transcript: WhisperXTranscript, startOffset: number, endOffset: number): WhisperXTranscript {
  const keepWord = (word: WhisperXWord) => word.end > startOffset && word.start < endOffset
  const words = transcript.words
    .filter(keepWord)
    .map((word) => ({
      ...word,
      start: roundSeconds(Math.max(0, word.start - startOffset)),
      end: roundSeconds(Math.max(0.01, Math.min(endOffset, word.end) - startOffset)),
    }))
    .filter((word) => word.end > word.start)
  const segments = transcript.segments
    .filter((segment) => segment.end > startOffset && segment.start < endOffset)
    .map((segment) => ({
      start: roundSeconds(Math.max(0, segment.start - startOffset)),
      end: roundSeconds(Math.max(0.01, Math.min(endOffset, segment.end) - startOffset)),
      text: segment.text,
    }))
    .filter((segment) => segment.end > segment.start)
  return {
    ...transcript,
    words,
    segments: segments.length > 0 ? segments : wordSegments(words),
    text: compact((segments.length > 0 ? segments : wordSegments(words)).map((segment) => segment.text).join(' '), 5000),
  }
}

function refineBoundaryWithTranscript(
  candidate: SelectedOpusCandidate,
  transcript: WhisperXTranscript,
): { selected: SelectedOpusCandidate; transcript: WhisperXTranscript; startOffset: number; endOffset: number } {
  const clipDuration = roundSeconds(candidate.sceneAdjustedEndSeconds - candidate.sceneAdjustedStartSeconds)
  const firstWord = transcript.words[0] ?? null
  const lastWord = transcript.words[transcript.words.length - 1] ?? null
  const firstSegment = transcript.segments[0] ?? null
  const lastSegment = transcript.segments[transcript.segments.length - 1] ?? null
  const firstSpeechStart = firstWord?.start ?? firstSegment?.start ?? 0
  const lastSpeechEnd = lastWord?.end ?? lastSegment?.end ?? clipDuration
  const openingOffset = findOpeningWordOffset(transcript.words, candidate.opening_line)
  const maxLeadTrim = openingOffset !== null ? 6 : 3
  const startOffset = clamp((openingOffset ?? firstSpeechStart) - 0.18, 0, Math.min(maxLeadTrim, Math.max(0, clipDuration - MIN_DURATION_SECONDS)))
  const candidatePayoffOffset = clamp(candidate.end_seconds - candidate.sceneAdjustedStartSeconds + 0.75, 0, clipDuration)
  const speechEndOffset = clamp(lastSpeechEnd + 0.65, 0, clipDuration)
  const desiredEndOffset = speechLedMoment(candidate)
    ? speechEndOffset
    : Math.max(candidatePayoffOffset, Math.min(clipDuration, speechEndOffset))
  const endOffset = clamp(desiredEndOffset, startOffset + MIN_DURATION_SECONDS - 1.5, clipDuration)
  const refinedStart = roundSeconds(candidate.sceneAdjustedStartSeconds + startOffset)
  const refinedEnd = roundSeconds(candidate.sceneAdjustedStartSeconds + endOffset)
  if (
    refinedEnd - refinedStart < MIN_DURATION_SECONDS - 1.5 ||
    refinedEnd - refinedStart > MAX_DURATION_SECONDS + 4 ||
    (Math.abs(refinedStart - candidate.sceneAdjustedStartSeconds) < 0.25 && Math.abs(refinedEnd - candidate.sceneAdjustedEndSeconds) < 0.25)
  ) {
    return { selected: candidate, transcript, startOffset: 0, endOffset: clipDuration }
  }

  return {
    selected: {
      ...candidate,
      sceneAdjustedStartSeconds: refinedStart,
      sceneAdjustedEndSeconds: refinedEnd,
      boundaryAdjustment: {
        originalStartSeconds: candidate.sceneAdjustedStartSeconds,
        originalEndSeconds: candidate.sceneAdjustedEndSeconds,
        refinedStartSeconds: refinedStart,
        refinedEndSeconds: refinedEnd,
        reason: openingOffset !== null ? 'opening_line_word_alignment' : 'first_and_last_speech_alignment',
      },
    },
    transcript: trimTranscript(transcript, startOffset, endOffset),
    startOffset,
    endOffset,
  }
}

function renderLayoutForCandidate(candidate: SelectedOpusCandidate): Extract<LocalRenderLayout, 'vertical-blur' | 'smart-center-crop'> {
  const text = `${candidate.visual_context} ${candidate.event_type} ${candidate.moment_type}`.toLowerCase()
  if (/\b(scoreboard|scorebug|full court|court|layup|jumper|three|block|rebound|steal|drive|transition|highlight)\b/.test(text)) {
    return 'vertical-blur'
  }
  if (speechLedMoment(candidate) || /\b(interview|podium|press|studio|podcast|close-up|talking|speaking|reaction)\b/.test(text)) {
    return 'smart-center-crop'
  }
  return 'vertical-blur'
}

export class ClipsAIVerticalResizeAdapter {
  async detectMode(): Promise<'clipsai_dynamic' | 'ffmpeg_vertical_blur_fallback'> {
    const available = await optionalCommand([pythonBinary(), '-c', 'import clipsai'])
    return available ? 'clipsai_dynamic' : 'ffmpeg_vertical_blur_fallback'
  }
}

export class ExistingVerticalRendererAdapter {
  async render(input: {
    clipPath: string
    packageId: string
    assetRoot: string
    openingText: string
    captionPrep: CaptionPrepV1
    layout?: Extract<LocalRenderLayout, 'vertical-blur' | 'smart-center-crop'>
  }): Promise<{ outputPath: string; quality: LocalRenderQualityValidation; cropQuality: 'clipsai_dynamic' | 'ffmpeg_vertical_blur_fallback' | 'ffmpeg_subject_aware_center_crop' }> {
    const crop = await new ClipsAIVerticalResizeAdapter().detectMode()
    const layout = input.layout ?? 'vertical-blur'
    const rendered = await renderLocalClipPrepVerticalAsset({
      sourcePath: input.clipPath,
      packageId: input.packageId,
      assetRoot: input.assetRoot,
      openingText: input.openingText,
      captionPrep: input.captionPrep,
      burnSubtitles: true,
      clipStartSeconds: 0,
      layout,
    })
    return {
      outputPath: rendered.outputPath,
      quality: rendered.qualityValidation,
      cropQuality: layout === 'smart-center-crop' ? 'ffmpeg_subject_aware_center_crop' : crop,
    }
  }
}

export class RBHQPersistenceAdapter {
  constructor(private readonly db: OpusDb) {}

  async createSourceVideoAndTranscript(input: {
    runId?: string | null
    source: PreparedOpusSource
    transcriptSegments: Array<{ start: number; end: number; text: string }>
    transcriptText: string
  }): Promise<{ sourceChannelId: string; videoId: string; transcriptId: string }> {
    const now = new Date().toISOString()
    const { data: sourceChannel, error: sourceError } = await this.db
      .from('source_channels')
      .upsert({
        channel_key: SOURCE_CHANNEL_KEY,
        display_name: SOURCE_DISPLAY_NAME,
        platform: 'opus_adapter',
        source_url: input.source.metadata.videoUrl,
        rss_url: input.source.metadata.videoUrl,
        target_rbhq_channel_id: RB_WOMEN_CHANNEL_ID,
        enabled: true,
        updated_at: now,
      }, { onConflict: 'channel_key' })
      .select('id')
      .single()
    if (sourceError || !sourceChannel) throw new Error(sourceError?.message || 'Source channel upsert failed.')

    const { data: video, error: videoError } = await this.db
      .from('ingested_videos')
      .upsert({
        source_channel_id: sourceChannel.id,
        external_video_id: input.source.metadata.externalVideoId,
        platform: input.source.metadata.platform,
        title: input.source.metadata.title,
        description: input.source.metadata.description,
        video_url: input.source.metadata.videoUrl,
        thumbnail_url: input.source.metadata.thumbnailUrl,
        published_at: input.source.metadata.publishedAt,
        duration_seconds: input.source.metadata.durationSeconds ? Math.round(input.source.metadata.durationSeconds) : null,
        ingest_status: 'transcript_available',
        raw_feed_entry: {
          source: 'rb_women_opus_adapter',
          inputKind: input.source.inputKind,
          sourceDownloaded: input.source.sourceDownloaded,
        },
        updated_at: now,
      }, { onConflict: 'platform,external_video_id' })
      .select('id')
      .single()
    if (videoError || !video) throw new Error(videoError?.message || 'Ingested video upsert failed.')

    const transcriptSource = input.runId ? `rb_women_autopilot:${input.runId}` : 'whisperx_selected_ranges'
    const { data: existingTranscript, error: existingTranscriptError } = await this.db
      .from('video_transcripts')
      .select('id')
      .eq('ingested_video_id', video.id)
      .eq('transcript_source', transcriptSource)
      .maybeSingle()
    if (existingTranscriptError) throw new Error(existingTranscriptError.message)

    const transcriptResult = existingTranscript
      ? await this.db
        .from('video_transcripts')
        .update({
          transcript_text: input.transcriptText,
          transcript_json: input.transcriptSegments,
          language: 'en',
        })
        .eq('id', existingTranscript.id)
        .select('id')
        .single()
      : await this.db
      .from('video_transcripts')
      .insert({
        ingested_video_id: video.id,
        transcript_source: transcriptSource,
        transcript_text: input.transcriptText,
        transcript_json: input.transcriptSegments,
        language: 'en',
      })
      .select('id')
      .single()
    const { data: transcript, error: transcriptError } = transcriptResult
    if (transcriptError || !transcript) throw new Error(transcriptError?.message || 'Transcript insert failed.')

    return {
      sourceChannelId: sourceChannel.id,
      videoId: video.id,
      transcriptId: transcript.id,
    }
  }

  async createCandidate(input: {
    runId?: string | null
    videoId: string
    transcriptId: string
    selected: SelectedOpusCandidate
    captionPrep: CaptionPrepV1
  }): Promise<string> {
    const now = new Date().toISOString()
    const durationSeconds = roundSeconds(input.selected.sceneAdjustedEndSeconds - input.selected.sceneAdjustedStartSeconds)
    const hashtags = hashtagsFor(input.selected)
    const caption = buildPostCaption(input.selected, hashtags)
    const score = input.selected.editorial.score
    const scoreBreakdown = {
      model: 'rb_women_opus_adapter_v1',
      autopilotRunId: input.runId ?? null,
      autopilotRank: String(input.selected.rank),
      autopilotStage: 'selected',
      rank: input.selected.rank,
      rankLabel: score >= 88 ? 'must_post' : 'strong',
      urgency: 'today',
      transcriptId: input.transcriptId,
      score,
      competition: input.selected.competition,
      womensBasketballPrimarySubject: input.selected.womens_basketball_primary_subject,
      primarySubjectType: input.selected.primary_subject_type,
      primarySubjectNames: input.selected.primary_subject_names,
      playerNames: input.selected.player_names,
      coachNames: input.selected.coach_names,
      teamNames: input.selected.team_names,
      momentType: input.selected.moment_type,
      eventType: input.selected.event_type,
      rbWomenLane: input.selected.editorial.rbWomenLane,
      rbWomenLanes: input.selected.rb_women_lanes,
      namedSearchEntities: input.selected.editorial.namedSearchEntities,
      youtubeShortsTitle: input.selected.editorial.youtubeShortsTitle,
      selectionReason: input.selected.editorial.selectionReason,
      queueDiversity: input.selected.editorial.queueDiversity,
      editorialScoreBreakdown: input.selected.editorial.scoreBreakdown,
      editorialBoosts: input.selected.editorial.boosts,
      editorialPenalties: input.selected.editorial.penalties,
      rejectionCodes: input.selected.editorial.rejectionCodes,
      sourceReliability: input.selected.source_reliability,
      timeliness: input.selected.timeliness,
      whyNow: input.selected.viral_reason,
      operatorSummary: input.selected.rb_women_angle,
      reasons: [
        input.selected.transcript_summary,
        input.selected.subject,
        input.selected.visual_context,
        input.selected.why_fans_care,
        input.selected.audience_fit_reason,
      ],
      suggestedCaption: caption,
      suggestedHashtags: hashtags,
    }
    const clipPrep = buildClipPrepV1({
      candidate: {
        title: input.selected.opening_line,
        summary: input.selected.transcript_summary,
        hook_text: input.selected.opening_line,
        caption,
        hashtags,
        start_seconds: input.selected.sceneAdjustedStartSeconds,
        end_seconds: input.selected.sceneAdjustedEndSeconds,
        score,
        score_breakdown: scoreBreakdown,
        target_channel_id: RB_WOMEN_CHANNEL_ID,
      },
      video: {
        id: input.videoId,
        title: input.selected.subject || input.selected.opening_line,
        description: input.selected.transcript_summary,
        duration_seconds: durationSeconds,
      },
      source: {
        display_name: SOURCE_DISPLAY_NAME,
        target_rbhq_channel_id: RB_WOMEN_CHANNEL_ID,
      },
      transcript: {
        transcript_source: 'whisperx_selected_range',
        transcript_text: input.captionPrep.transcript_segment_range?.text ?? input.selected.transcript_summary,
        transcript_json: input.captionPrep.transcript_segments ?? [],
        language: 'en',
      },
    })
    const payload = {
        ingested_video_id: input.videoId,
        target_channel_id: RB_WOMEN_CHANNEL_ID,
        start_seconds: input.selected.sceneAdjustedStartSeconds,
        end_seconds: input.selected.sceneAdjustedEndSeconds,
        suggested_clip_start_seconds: input.selected.sceneAdjustedStartSeconds,
        suggested_clip_end_seconds: input.selected.sceneAdjustedEndSeconds,
        suggested_clip_length_seconds: durationSeconds,
        title: compact(input.selected.opening_line, 180),
        summary: compact(input.selected.transcript_summary, 500),
        hook_text: compact(input.selected.opening_line, 180),
        caption,
        hashtags,
        score,
        score_breakdown: scoreBreakdown,
        clip_reason: input.selected.viral_reason,
        opening_text: input.selected.opening_line,
        edit_notes: [
          ...(input.runId ? [`autopilot_run:${input.runId}`, 'autopilot_stage:selected'] : []),
          `autopilot_source_video:${input.videoId}`,
          `autopilot_rank:${input.selected.rank}`,
          `Gemini selected ${input.selected.start_seconds}-${input.selected.end_seconds}.`,
          `Scene/padded cut ${input.selected.sceneAdjustedStartSeconds}-${input.selected.sceneAdjustedEndSeconds}.`,
          ...(input.selected.boundaryAdjustment
            ? [`Hook-first boundary: ${input.selected.boundaryAdjustment.originalStartSeconds}-${input.selected.boundaryAdjustment.originalEndSeconds} -> ${input.selected.boundaryAdjustment.refinedStartSeconds}-${input.selected.boundaryAdjustment.refinedEndSeconds} (${input.selected.boundaryAdjustment.reason}).`]
            : []),
          `Visual context: ${input.selected.visual_context}`,
          `RB Women eligibility: ${input.selected.competition}; ${input.selected.editorial.namedSearchEntities.join(', ')}`,
          `RB Women lane: ${input.selected.editorial.rbWomenLane}; score ${score}.`,
          'RB Women Opus adapter: stop before Metricool scheduling.',
        ],
        asset_instructions: 'Automated RB Women Opus path renders a 1080x1920 H.264/AAC MP4 and uploads it to R2.',
        clip_prep_status: 'ready',
        clip_prep_confidence: 'high',
        clip_prep: {
          ...clipPrep,
          caption_prep: input.captionPrep,
          safety: {
            downloads_video: false,
            renders_video: false,
            uploads_video: false,
            posts_video: false,
          },
        },
        status: 'approved_for_handoff',
        updated_at: now,
      }
    const existing = input.runId
      ? await this.findAutopilotCandidate(input.runId, input.selected.rank, input.videoId)
      : null
    const result = existing
      ? await this.db
        .from('clip_candidates')
        .update(payload)
        .eq('id', existing.id)
        .select('id')
        .single()
      : await this.db
        .from('clip_candidates')
        .insert(payload)
        .select('id')
        .single()
    const { data, error } = result
    if (error || !data) throw new Error(error?.message || 'Clip candidate insert failed.')
    return data.id
  }

  async findAutopilotCandidate(
    runId: string,
    rank: number,
    videoId?: string | null,
  ): Promise<{ id: string } | null> {
    const runNote = `autopilot_run:${runId}`
    const rankNote = `autopilot_rank:${rank}`
    let query = this.db
      .from('clip_candidates')
      .select('id')
      .eq('target_channel_id', RB_WOMEN_CHANNEL_ID)
      .contains('edit_notes', [runNote, rankNote])
      .limit(1)

    if (videoId) {
      query = query.eq('ingested_video_id', videoId)
    }

    const { data, error } = await query.maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return data as { id: string }

    let fallbackQuery = this.db
      .from('clip_candidates')
      .select('id')
      .eq('target_channel_id', RB_WOMEN_CHANNEL_ID)
      .contains('edit_notes', [runNote])

    if (videoId) {
      fallbackQuery = fallbackQuery.eq('ingested_video_id', videoId)
    }

    const { data: fallbackCandidates, error: fallbackError } = await fallbackQuery
    if (fallbackError) throw new Error(fallbackError.message)
    const candidateIds = (fallbackCandidates ?? []).map((candidate) => candidate.id)
    if (candidateIds.length === 0) return null

    const { data: packages, error: packageError } = await this.db
      .from('mac_mini_clip_packages')
      .select('clip_candidate_id, asset_public_url, local_asset_path')
      .in('clip_candidate_id', candidateIds)

    if (packageError) throw new Error(packageError.message)
    const matched = (packages ?? []).find((pkg) => {
      const value = `${pkg.asset_public_url ?? ''} ${pkg.local_asset_path ?? ''}`
      return new RegExp(`rank-${rank}(?:\\D|$)`).test(value)
    })
    return matched?.clip_candidate_id ? { id: matched.clip_candidate_id } : null
  }

  async findAutopilotOutput(runId: string, rank: number): Promise<{
    candidateId: string
    packageId: string | null
    clipId: string | null
    publicUrl: string | null
    queueEligible: boolean
  } | null> {
    const candidate = await this.findAutopilotCandidate(runId, rank)
    if (!candidate) return null

    const { data: pkg, error: pkgError } = await this.db
      .from('mac_mini_clip_packages')
      .select('id, asset_public_url')
      .eq('clip_candidate_id', candidate.id)
      .maybeSingle()
    if (pkgError) throw new Error(pkgError.message)

    let clipId: string | null = null
    let publicUrl = typeof pkg?.asset_public_url === 'string' ? pkg.asset_public_url : null
    if (pkg?.id) {
      const { data: clip, error: clipError } = await this.db
        .from('clips')
        .select('id, video_url')
        .eq('external_id', `platform_package:${pkg.id}`)
        .maybeSingle()
      if (clipError) throw new Error(clipError.message)
      clipId = typeof clip?.id === 'string' ? clip.id : null
      publicUrl = typeof clip?.video_url === 'string' ? clip.video_url : publicUrl
    }

    const workflow = clipId
      ? await getMetricoolWorkflowClips({ limit: 200, channelIds: [RB_WOMEN_CHANNEL_ID] })
      : []

    return {
      candidateId: candidate.id,
      packageId: typeof pkg?.id === 'string' ? pkg.id : null,
      clipId,
      publicUrl,
      queueEligible: clipId ? workflow.some((clip) => clip.id === clipId) : false,
    }
  }

  async packageRenderAndExport(input: {
    candidateId: string
    verticalPath: string
    assetRoot: string
  }): Promise<{ packageId: string; clipId: string; publicUrl: string | null; queueEligible: boolean }> {
    const pkg = await createMacMiniClipPackageFromCandidate(this.db, input.candidateId)
    const attached = await attachMacMiniLocalAsset(this.db, pkg.id, input.verticalPath, {
      assetRoot: input.assetRoot,
    })
    const exported = await createPlatformReadyPackageFromMacMini(this.db, attached.id)
    const workflow = await getMetricoolWorkflowClips({
      limit: 200,
      channelIds: [RB_WOMEN_CHANNEL_ID],
    })
    return {
      packageId: attached.id,
      clipId: exported.clipId,
      publicUrl: exported.publicUrl,
      queueEligible: workflow.some((clip) => clip.id === exported.clipId),
    }
  }
}

function hashtagsFor(candidate: SelectedOpusCandidate): string[] {
  const text = `${candidate.subject} ${candidate.rb_women_angle} ${candidate.viral_reason} ${candidate.competition} ${candidate.editorial.rbWomenLane}`.toLowerCase()
  const tags = ['#RBWomen', '#WomensSports']
  if (text.includes('wnba')) tags.push('#WNBA')
  if (text.includes('basketball') || text.includes('hoops')) tags.push('#Basketball')
  if (text.includes('college')) tags.push('#NCAAWBB')
  if (text.includes('debate') || text.includes('controvers')) tags.push('#SportsDebate')
  if (text.includes('media')) tags.push('#SportsMedia')
  tags.push('#RunItBack')
  return [...new Set([...tags, '#WomensBasketball', '#WNBA', '#Basketball'])].slice(0, 5)
}

function buildPostCaption(candidate: SelectedOpusCandidate, hashtags: string[]): string {
  const subject = candidate.editorial.namedSearchEntities[0] ?? candidate.subject
  const base = compact(`${subject}: ${candidate.opening_line} ${candidate.rb_women_angle}`, 220)
  return compact(`${base}\n\n${hashtags.join(' ')}`, 300)
}

function captionPrepFromWhisperX(selected: SelectedOpusCandidate, transcript: WhisperXTranscript): CaptionPrepV1 {
  const segments = transcript.segments.length > 0 ? transcript.segments : wordSegments(transcript.words)
  const text = compact(segments.map((segment) => segment.text).join(' '), 700)
  return {
    version: 'rbhq-caption-prep-v1',
    subtitle_source: 'transcript',
    suggested_on_screen_hook: compact(selected.opening_line, 90),
    first_two_second_opener_text: compact(segments.find((segment) => segment.start < 2.1)?.text ?? selected.opening_line, 90),
    caption_safe_zone_notes: [
      'Word-timed WhisperX captions from selected range only.',
      'Use bold lower-third safe zone in the 1080x1920 RB Women render.',
    ],
    suggested_subtitle_style: {
      preset: 'bold-lower-third',
      position: 'lower_third_caption_safe',
      max_lines: 2,
      burned_in: false,
    },
    transcript_segment_range: {
      start_seconds: 0,
      end_seconds: roundSeconds(selected.sceneAdjustedEndSeconds - selected.sceneAdjustedStartSeconds),
      text,
      segment_count: segments.length,
    },
    transcript_segments: segments.map((segment) => ({
      start_seconds: roundSeconds(segment.start),
      end_seconds: roundSeconds(segment.end),
      text: compact(segment.text, 120),
    })),
    safety: {
      burned_in: false,
      uploads_video: false,
      posts_video: false,
    },
  }
}

function selectedTranscriptForStorage(selected: SelectedOpusCandidate, transcript: WhisperXTranscript) {
  return transcript.segments.map((segment) => ({
    start: roundSeconds(segment.start + selected.sceneAdjustedStartSeconds),
    end: roundSeconds(segment.end + selected.sceneAdjustedStartSeconds),
    text: segment.text,
  }))
}

export function createOpusSupabaseClient(): OpusDb {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(supabaseUrl, serviceKey)
}

export async function probeRBWomenOpusAdapters(): Promise<{
  envPresence: Record<string, boolean>
  python: string
  tools: Record<'ffmpeg' | 'ffprobe' | 'yt-dlp' | 'whisperx' | 'scenedetect' | 'clipsai', boolean>
  readyForRealRun: boolean
}> {
  const python = pythonBinary()
  const envPresence = {
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY?.trim()),
    SUPABASE_URL: Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim()),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    R2_ACCOUNT_ID: Boolean(process.env.R2_ACCOUNT_ID?.trim()),
    R2_ACCESS_KEY_ID: Boolean(process.env.R2_ACCESS_KEY_ID?.trim()),
    R2_SECRET_ACCESS_KEY: Boolean(process.env.R2_SECRET_ACCESS_KEY?.trim()),
    R2_BUCKET: Boolean(process.env.R2_BUCKET?.trim()),
    R2_PUBLIC_BASE_URL: Boolean(process.env.R2_PUBLIC_BASE_URL?.trim()),
  }
  const tools = {
    ffmpeg: await optionalCommand(['ffmpeg', '-version']),
    ffprobe: await optionalCommand(['ffprobe', '-version']),
    'yt-dlp': await optionalCommand(['yt-dlp', '--version']),
    whisperx: await optionalCommand([python, '-c', 'import whisperx']),
    scenedetect: await optionalCommand([python, '-c', 'import scenedetect']),
    clipsai: await optionalCommand([python, '-c', 'import clipsai']),
  }
  const required = [
    envPresence.GEMINI_API_KEY,
    envPresence.SUPABASE_URL,
    envPresence.SUPABASE_SERVICE_ROLE_KEY,
    envPresence.R2_ACCOUNT_ID,
    envPresence.R2_ACCESS_KEY_ID,
    envPresence.R2_SECRET_ACCESS_KEY,
    envPresence.R2_BUCKET,
    envPresence.R2_PUBLIC_BASE_URL,
    tools.ffmpeg,
    tools.ffprobe,
    tools['yt-dlp'],
    tools.whisperx,
    tools.scenedetect,
  ]
  return {
    envPresence,
    python,
    tools,
    readyForRealRun: required.every(Boolean),
  }
}

export async function runRBWomenOpusPipeline(db: OpusDb, input: OpusSourceInput): Promise<OpusRunReport> {
  const started = Date.now()
  const assetRoot = path.resolve(input.assetRoot ?? DEFAULT_ASSET_ROOT)
  const source = await new OpusSourceAdapter().prepare({ ...input, assetRoot })
  const gemini = new GeminiVideoUnderstandingAdapter()
  const selector = new CandidateSelectorAdapter()
  const sceneDetect = new PySceneDetectAdapter()
  const ffmpeg = new FFmpegClipAdapter()
  const whisperx = new WhisperXAdapter()
  const renderer = new ExistingVerticalRendererAdapter()
  const persistence = new RBHQPersistenceAdapter(db)

  const adapterStatus: OpusRunReport['adapterStatus'] = {
    gemini: 'failed',
    ffmpeg: 'ok',
    whisperx: 'failed',
    scenedetect: 'failed',
    clipsai: 'missing_or_incompatible',
    renderer: 'existing_local_renderer',
    rbhqPipeline: 'failed',
  }
  let reportPath: string | null = null
  let geminiCandidates: GeminiOpusCandidate[] = []
  let editorialGate = evaluateRBWomenCandidates([])
  const clips: OpusClipResult[] = []

  try {
    geminiCandidates = await gemini.requestCandidates(source)
    adapterStatus.gemini = 'ok'
    editorialGate = evaluateRBWomenCandidates(geminiCandidates)
    const selected = selector.select(editorialGate.eligible, source.metadata.durationSeconds)
    const runId = compact(input.runId, 100) || randomUUID()
    const allStorageSegments: Array<{ start: number; end: number; text: string }> = []
    const textParts: string[] = []
    const storageRefs: Array<{ rank: number; selected: SelectedOpusCandidate; transcript: WhisperXTranscript; captionPrep: CaptionPrepV1 }> = []

    for (const candidate of selected) {
      let current = candidate
      try {
        const existingOutput = await persistence.findAutopilotOutput(runId, current.rank)
        if (existingOutput?.clipId && existingOutput.queueEligible) {
          clips.push({
            rank: current.rank,
            stage: 'queue_ready',
            candidateId: existingOutput.candidateId,
            packageId: existingOutput.packageId,
            clipId: existingOutput.clipId,
            localCutPath: null,
            localVerticalPath: null,
            publicUrl: existingOutput.publicUrl,
            queueEligible: true,
            quality: null,
            selected: current,
            captionAccuracy: 'word_timed_whisperx',
            verticalCropQuality: 'ffmpeg_vertical_blur_fallback',
            publishableWithoutManualEditing: true,
            failure: null,
          })
          continue
        }
        try {
          current = await sceneDetect.adjustRange(source.sourcePath, candidate)
          adapterStatus.scenedetect = 'ok'
        } catch (error) {
          adapterStatus.scenedetect = error instanceof Error && error.message.includes('not installed') ? 'missing' : 'failed'
          throw error
        }
        const cutPath = path.join(assetRoot, 'cuts', `${runId}-rank-${current.rank}.mp4`)
        const cut = await ffmpeg.cut({
          sourcePath: source.sourcePath,
          outputPath: cutPath,
          assetRoot,
          startSeconds: current.sceneAdjustedStartSeconds,
          endSeconds: current.sceneAdjustedEndSeconds,
        })
        let transcript = await whisperx.transcribe({
          clipPath: cut.outputPath,
          outputDir: path.join(assetRoot, 'whisperx', `${runId}-rank-${current.rank}`),
        })
        adapterStatus.whisperx = 'ok'
        const refined = refineBoundaryWithTranscript(current, transcript)
        current = refined.selected
        transcript = refined.transcript
        let finalCut = cut
        const initialCutDuration = cut.quality.durationSeconds ?? (candidate.sceneAdjustedEndSeconds - candidate.sceneAdjustedStartSeconds)
        if (refined.startOffset > 0.25 || Math.abs(refined.endOffset - initialCutDuration) > 0.25) {
          finalCut = await ffmpeg.cut({
            sourcePath: source.sourcePath,
            outputPath: path.join(assetRoot, 'cuts', `${runId}-rank-${current.rank}-refined.mp4`),
            assetRoot,
            startSeconds: current.sceneAdjustedStartSeconds,
            endSeconds: current.sceneAdjustedEndSeconds,
          })
        }
        const captionPrep = captionPrepFromWhisperX(current, transcript)
        storageRefs.push({ rank: current.rank, selected: current, transcript, captionPrep })
        allStorageSegments.push(...selectedTranscriptForStorage(current, transcript))
        textParts.push(transcript.text)
        clips.push({
          rank: current.rank,
          stage: 'cut',
          candidateId: null,
          packageId: null,
          clipId: null,
          localCutPath: finalCut.outputPath,
          localVerticalPath: null,
          publicUrl: null,
          queueEligible: false,
          quality: finalCut.quality,
          selected: current,
          captionAccuracy: 'word_timed_whisperx',
          verticalCropQuality: 'failed',
          publishableWithoutManualEditing: false,
          failure: null,
        })
      } catch (error) {
        clips.push({
          rank: current.rank,
          stage: 'failed',
          candidateId: null,
          packageId: null,
          clipId: null,
          localCutPath: null,
          localVerticalPath: null,
          publicUrl: null,
          queueEligible: false,
          quality: null,
          selected: current,
          captionAccuracy: 'failed',
          verticalCropQuality: 'failed',
          publishableWithoutManualEditing: false,
          failure: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (storageRefs.length > 0) {
      const stored = await persistence.createSourceVideoAndTranscript({
        runId,
        source,
        transcriptSegments: allStorageSegments,
        transcriptText: compact(textParts.join(' '), 8000),
      })
      for (const ref of storageRefs) {
        const clip = clips.find((item) => item.rank === ref.rank)
        if (!clip?.localCutPath) continue
        const candidateId = await persistence.createCandidate({
          runId,
          videoId: stored.videoId,
          transcriptId: stored.transcriptId,
          selected: ref.selected,
          captionPrep: ref.captionPrep,
        })
        const pkg = await createMacMiniClipPackageFromCandidate(db, candidateId)
        const renderLayout = renderLayoutForCandidate(ref.selected)
        const rendered = await renderer.render({
          clipPath: clip.localCutPath,
          packageId: pkg.id,
          assetRoot,
          openingText: ref.selected.opening_line,
          captionPrep: ref.captionPrep,
          layout: renderLayout,
        })
        adapterStatus.clipsai = rendered.cropQuality === 'clipsai_dynamic' ? 'ok' : 'missing_or_incompatible'
        const platform = await persistence.packageRenderAndExport({
          candidateId,
          verticalPath: rendered.outputPath,
          assetRoot,
        })
        const quality = await validateRenderedMp4Quality(rendered.outputPath, {
          expectedWidth: 1080,
          expectedHeight: 1920,
        })
        Object.assign(clip, {
          stage: platform.queueEligible ? 'queue_ready' : 'packaged',
          candidateId,
          packageId: platform.packageId,
          clipId: platform.clipId,
          localVerticalPath: rendered.outputPath,
          publicUrl: platform.publicUrl,
          queueEligible: platform.queueEligible,
          quality,
          verticalCropQuality: rendered.cropQuality,
          publishableWithoutManualEditing: platform.queueEligible && quality.valid,
        })
      }
      adapterStatus.rbhqPipeline = 'ok'
    }
  } finally {
    if (input.writeReport) {
      await mkdir(assetRoot, { recursive: true })
      reportPath = path.join(assetRoot, `opus-report-${Date.now()}.json`)
    }
  }

  const report: OpusRunReport = {
    result: clips.some((clip) => clip.publishableWithoutManualEditing) ? 'PASS' : 'FAIL',
    source: source.metadata,
    geminiCandidatesReturned: geminiCandidates.length,
    eligibleCandidates: editorialGate.eligible.length,
    rejectedCandidates: editorialGate.rejected.map((item) => ({
      startSeconds: item.candidate.start_seconds,
      endSeconds: item.candidate.end_seconds,
      subject: item.candidate.subject,
      competition: item.candidate.competition,
      rejectionCodes: item.rejectionCodes,
      reason: item.selectionReason || item.candidate.viral_reason,
    })),
    clipsSelected: clips.length,
    clips,
    processingTimeSeconds: roundSeconds((Date.now() - started) / 1000),
    reportPath,
    adapterStatus,
    safety: {
      callsMetricoolSchedule: false,
      postsToSocialPlatforms: false,
      uploadsToSocialPlatforms: false,
      uploadsToR2: clips.some((clip) => Boolean(clip.publicUrl)),
    },
  }

  if (reportPath) {
    await writeFile(reportPath, JSON.stringify(report, null, 2))
  }
  return report
}
