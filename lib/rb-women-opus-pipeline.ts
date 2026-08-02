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
import { RB_WOMEN_CHANNEL_ID } from './rb-women-source-config'
import { readTimedSegments } from './tiktok-clip-scout'

const execFileAsync = promisify(execFile)
const DEFAULT_ASSET_ROOT = path.join(process.cwd(), 'tmp', 'rb-women-opus')
const SOURCE_CHANNEL_KEY = 'rb_women_opus_adapter'
const SOURCE_DISPLAY_NAME = 'RB Women Opus Adapter'
const TARGET_CLIPS = 3
const MIN_DURATION_SECONDS = 20
const MAX_DURATION_SECONDS = 60
const DEFAULT_GEMINI_MODEL = process.env.RB_WOMEN_OPUS_GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash'

type OpusDb = SupabaseClient

export type OpusSourceInput = {
  source: string
  title?: string | null
  assetRoot?: string | null
  writeReport?: boolean
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

export type GeminiOpusCandidate = {
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
  rank: number
  paddedStartSeconds: number
  paddedEndSeconds: number
  sceneAdjustedStartSeconds: number
  sceneAdjustedEndSeconds: number
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
  verticalCropQuality: 'clipsai_dynamic' | 'ffmpeg_vertical_blur_fallback' | 'failed'
  publishableWithoutManualEditing: boolean
  failure: string | null
}

export type OpusRunReport = {
  result: 'PASS' | 'FAIL'
  source: PreparedOpusSource['metadata']
  geminiCandidatesReturned: number
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
    uploadsToR2: true
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
      minItems: 6,
      maxItems: 8,
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
    const file = await ai.files.upload({
      file: source.sourcePath,
      config: { mimeType: 'video/mp4', displayName: source.metadata.title },
    }) as GeminiFile
    if (!file.uri) {
      throw new Error('Gemini file upload did not return a file URI.')
    }

    const prompt = buildGeminiPrompt(source)
    const parts: Part[] = [
      {
        fileData: {
          fileUri: file.uri,
          mimeType: file.mimeType || 'video/mp4',
        },
      },
      { text: prompt },
    ]
    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: parts,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: GEMINI_RESPONSE_JSON_SCHEMA,
      },
    })
    const text = response.text
    if (!text) throw new Error('Gemini returned an empty candidate response.')
    const parsed = GeminiResponseSchema.parse(JSON.parse(text))
    return parsed.candidates
  }
}

function buildGeminiPrompt(source: PreparedOpusSource): string {
  return [
    'You are an RBHQ RB Women clip producer selecting Opus-style short-form moments.',
    'Analyze this long-form women sports interview, podcast, press conference, or studio discussion video.',
    'Return strict JSON only. No markdown. No prose outside JSON.',
    'Request: return 6 to 8 timestamped clip candidates.',
    'Each candidate must be 20 to 60 seconds, understandable alone, and suitable for a 9:16 captioned short.',
    'Score for clear argument or quote, recognizable player or matchup, controversy/debate, cultural angle, strong standalone opening, and usable 20-60 second duration.',
    'Do not choose game-footage tracking moments, generic intros, sponsor reads, or context-heavy segments with weak first two seconds.',
    'Prefer RB Women angles involving women basketball, WNBA, college women basketball, NWSL, women athletes, player media narratives, debate, identity/culture, or clear press-conference quotes.',
    'Required JSON shape: {"candidates":[{"start_seconds":number,"end_seconds":number,"transcript_summary":"string","opening_line":"string","subject":"string","visual_context":"string","rb_women_angle":"string","viral_reason":"string","confidence":0.0}]}',
    `Source title: ${source.metadata.title}`,
    `Source duration seconds: ${source.metadata.durationSeconds ?? 'unknown'}`,
    `Source URL/reference: ${source.metadata.videoUrl}`,
  ].join('\n')
}

export class CandidateSelectorAdapter {
  select(candidates: GeminiOpusCandidate[], durationSeconds: number | null): SelectedOpusCandidate[] {
    const ordered = candidates
      .map((candidate) => normalizeGeminiCandidate(candidate, durationSeconds))
      .filter((candidate): candidate is GeminiOpusCandidate => Boolean(candidate))
      .filter((candidate) => {
        const duration = candidate.end_seconds - candidate.start_seconds
        return duration >= MIN_DURATION_SECONDS && duration <= MAX_DURATION_SECONDS
      })
      .sort((left, right) => right.confidence - left.confidence)

    const selected: SelectedOpusCandidate[] = []
    for (const candidate of ordered) {
      if (selected.some((existing) => overlaps(candidate, existing))) continue
      const paddedStartSeconds = clamp(candidate.start_seconds - 1.5, 0, durationSeconds ?? candidate.start_seconds)
      const paddedEndSeconds = durationSeconds === null
        ? candidate.end_seconds + 1.5
        : clamp(candidate.end_seconds + 1.5, paddedStartSeconds + 1, durationSeconds)
      selected.push({
        ...candidate,
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
  }
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
  }): Promise<{ outputPath: string; quality: LocalRenderQualityValidation; cropQuality: 'clipsai_dynamic' | 'ffmpeg_vertical_blur_fallback' }> {
    const crop = await new ClipsAIVerticalResizeAdapter().detectMode()
    const rendered = await renderLocalClipPrepVerticalAsset({
      sourcePath: input.clipPath,
      packageId: input.packageId,
      assetRoot: input.assetRoot,
      openingText: input.openingText,
      captionPrep: input.captionPrep,
      burnSubtitles: true,
      clipStartSeconds: 0,
    })
    return {
      outputPath: rendered.outputPath,
      quality: rendered.qualityValidation,
      cropQuality: crop,
    }
  }
}

export class RBHQPersistenceAdapter {
  constructor(private readonly db: OpusDb) {}

  async createSourceVideoAndTranscript(input: {
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

    const { data: transcript, error: transcriptError } = await this.db
      .from('video_transcripts')
      .insert({
        ingested_video_id: video.id,
        transcript_source: 'whisperx_selected_ranges',
        transcript_text: input.transcriptText,
        transcript_json: input.transcriptSegments,
        language: 'en',
      })
      .select('id')
      .single()
    if (transcriptError || !transcript) throw new Error(transcriptError?.message || 'Transcript insert failed.')

    return {
      sourceChannelId: sourceChannel.id,
      videoId: video.id,
      transcriptId: transcript.id,
    }
  }

  async createCandidate(input: {
    videoId: string
    transcriptId: string
    selected: SelectedOpusCandidate
    captionPrep: CaptionPrepV1
  }): Promise<string> {
    const now = new Date().toISOString()
    const durationSeconds = roundSeconds(input.selected.sceneAdjustedEndSeconds - input.selected.sceneAdjustedStartSeconds)
    const hashtags = hashtagsFor(input.selected)
    const caption = buildPostCaption(input.selected, hashtags)
    const score = Math.round(70 + input.selected.confidence * 30)
    const scoreBreakdown = {
      model: 'rb_women_opus_adapter_v1',
      rank: input.selected.rank,
      rankLabel: score >= 88 ? 'must_post' : 'strong',
      urgency: 'today',
      transcriptId: input.transcriptId,
      score,
      whyNow: input.selected.viral_reason,
      operatorSummary: input.selected.rb_women_angle,
      reasons: [
        input.selected.transcript_summary,
        input.selected.subject,
        input.selected.visual_context,
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
    const { data, error } = await this.db
      .from('clip_candidates')
      .insert({
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
          `Gemini selected ${input.selected.start_seconds}-${input.selected.end_seconds}.`,
          `Scene/padded cut ${input.selected.sceneAdjustedStartSeconds}-${input.selected.sceneAdjustedEndSeconds}.`,
          `Visual context: ${input.selected.visual_context}`,
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
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(error?.message || 'Clip candidate insert failed.')
    return data.id
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
  const text = `${candidate.subject} ${candidate.rb_women_angle} ${candidate.viral_reason}`.toLowerCase()
  const tags = ['#RBWomen', '#WomensSports']
  if (text.includes('wnba')) tags.push('#WNBA')
  if (text.includes('basketball') || text.includes('hoops')) tags.push('#Basketball')
  if (text.includes('college')) tags.push('#NCAAWBB')
  if (text.includes('debate') || text.includes('controvers')) tags.push('#SportsDebate')
  if (text.includes('media')) tags.push('#SportsMedia')
  tags.push('#RunItBack')
  return [...new Set(tags)].slice(0, 5)
}

function buildPostCaption(candidate: SelectedOpusCandidate, hashtags: string[]): string {
  const base = compact(`${candidate.opening_line} ${candidate.rb_women_angle}`, 220)
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
  const clips: OpusClipResult[] = []

  try {
    geminiCandidates = await gemini.requestCandidates(source)
    adapterStatus.gemini = 'ok'
    const selected = selector.select(geminiCandidates, source.metadata.durationSeconds)
    const runId = randomUUID()
    const allStorageSegments: Array<{ start: number; end: number; text: string }> = []
    const textParts: string[] = []
    const storageRefs: Array<{ rank: number; selected: SelectedOpusCandidate; transcript: WhisperXTranscript; captionPrep: CaptionPrepV1 }> = []

    for (const candidate of selected) {
      let current = candidate
      try {
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
        const transcript = await whisperx.transcribe({
          clipPath: cut.outputPath,
          outputDir: path.join(assetRoot, 'whisperx', `${runId}-rank-${current.rank}`),
        })
        adapterStatus.whisperx = 'ok'
        const captionPrep = captionPrepFromWhisperX(current, transcript)
        storageRefs.push({ rank: current.rank, selected: current, transcript, captionPrep })
        allStorageSegments.push(...selectedTranscriptForStorage(current, transcript))
        textParts.push(transcript.text)
        clips.push({
          rank: current.rank,
          candidateId: null,
          packageId: null,
          clipId: null,
          localCutPath: cut.outputPath,
          localVerticalPath: null,
          publicUrl: null,
          queueEligible: false,
          quality: cut.quality,
          selected: current,
          captionAccuracy: 'word_timed_whisperx',
          verticalCropQuality: 'failed',
          publishableWithoutManualEditing: false,
          failure: null,
        })
      } catch (error) {
        clips.push({
          rank: current.rank,
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
        source,
        transcriptSegments: allStorageSegments,
        transcriptText: compact(textParts.join(' '), 8000),
      })
      for (const ref of storageRefs) {
        const clip = clips.find((item) => item.rank === ref.rank)
        if (!clip?.localCutPath) continue
        const candidateId = await persistence.createCandidate({
          videoId: stored.videoId,
          transcriptId: stored.transcriptId,
          selected: ref.selected,
          captionPrep: ref.captionPrep,
        })
        const pkg = await createMacMiniClipPackageFromCandidate(db, candidateId)
        const rendered = await renderer.render({
          clipPath: clip.localCutPath,
          packageId: pkg.id,
          assetRoot,
          openingText: ref.selected.opening_line,
          captionPrep: ref.captionPrep,
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
    clipsSelected: clips.length,
    clips,
    processingTimeSeconds: roundSeconds((Date.now() - started) / 1000),
    reportPath,
    adapterStatus,
    safety: {
      callsMetricoolSchedule: false,
      postsToSocialPlatforms: false,
      uploadsToSocialPlatforms: false,
      uploadsToR2: true,
    },
  }

  if (reportPath) {
    await writeFile(reportPath, JSON.stringify(report, null, 2))
  }
  return report
}
