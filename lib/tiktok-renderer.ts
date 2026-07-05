import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import type { SupabaseClient } from '@supabase/supabase-js'

const execFileAsync = promisify(execFile)

type ClipRow = {
  id: string
  title: string | null
  status: string
  publish_status: string | null
  video_url: string | null
  source_url: string | null
  duration_seconds: number | string | null
  moderation_notes: unknown
  risk_flags: unknown
  approved_at: string | null
  manually_published_at: string | null
}

export type TikTokRenderResult = {
  clipId: string
  status: 'rendered'
  outputPath: string
  durationSeconds: number
  sizeBytes: number
  width: number
  height: number
  mimeType: 'video/mp4'
  format: 'mp4'
  startSeconds: number
  endSeconds: number
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  if (typeof value === 'string') {
    try {
      return normalizeStringArray(JSON.parse(value) as unknown)
    } catch {
      return []
    }
  }

  return []
}

function readTimedNote(notes: string[], key: 'candidate_start_seconds' | 'candidate_end_seconds'): number | null {
  const note = notes.find((item) => item.startsWith(`${key}:`))
  if (!note) return null
  const parsed = Number(note.slice(key.length + 1).trim())
  return Number.isFinite(parsed) ? parsed : null
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function sanitizeFileStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'clip'
}

async function fileExists(value: string): Promise<boolean> {
  try {
    const stat = await fs.stat(value)
    return stat.isFile()
  } catch {
    return false
  }
}

async function requireBinary(binary: 'ffmpeg' | 'ffprobe' | 'yt-dlp'): Promise<void> {
  try {
    const args = binary === 'yt-dlp' ? ['--version'] : ['-version']
    await execFileAsync(binary, args, { maxBuffer: 1024 * 1024 })
  } catch {
    throw new Error(`${binary} is required for TikTok clip rendering.`)
  }
}

async function resolveSourceMedia(input: {
  sourceUrl: string
  clipId: string
  workDir: string
}): Promise<string> {
  if (!isHttpUrl(input.sourceUrl)) {
    const absolute = path.resolve(input.sourceUrl)
    if (!(await fileExists(absolute))) {
      throw new Error(`Local source video does not exist: ${absolute}`)
    }
    return absolute
  }

  await requireBinary('yt-dlp')
  const downloadDir = path.join(input.workDir, 'source-downloads')
  await fs.mkdir(downloadDir, { recursive: true })
  const outputTemplate = path.join(downloadDir, `${sanitizeFileStem(input.clipId)}.%(ext)s`)
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
      input.sourceUrl,
    ],
    { maxBuffer: 1024 * 1024 * 20 },
  )

  const downloaded = await fs.readdir(downloadDir)
  const match = downloaded
    .filter((file) => file.startsWith(sanitizeFileStem(input.clipId)) && file.toLowerCase().endsWith('.mp4'))
    .map((file) => path.join(downloadDir, file))
    .sort()
    .at(0)

  if (!match) {
    throw new Error('yt-dlp completed but did not produce an MP4 source file.')
  }

  return match
}

async function probeMedia(filePath: string): Promise<{ durationSeconds: number; width: number | null; height: number | null }> {
  await requireBinary('ffprobe')
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=width,height', '-show_entries', 'format=duration', '-of', 'json', filePath],
    { maxBuffer: 1024 * 1024 },
  )
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>
    format?: { duration?: string }
  }
  const videoStream = parsed.streams?.find((stream) => Number.isFinite(stream.width) && Number.isFinite(stream.height))
  const duration = Number(parsed.format?.duration)
  return {
    durationSeconds: Number.isFinite(duration) ? duration : 0,
    width: Number.isFinite(videoStream?.width) ? videoStream?.width ?? null : null,
    height: Number.isFinite(videoStream?.height) ? videoStream?.height ?? null : null,
  }
}

export async function renderTikTokClipFromReview(
  supabase: SupabaseClient,
  clipId: string,
  input: { outputDir?: string } = {},
): Promise<TikTokRenderResult> {
  await requireBinary('ffmpeg')

  const { data, error } = await supabase
    .from('clips')
    .select('id, title, status, publish_status, video_url, source_url, duration_seconds, moderation_notes, risk_flags, approved_at, manually_published_at')
    .eq('id', clipId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Review clip not found.')
  }

  const clip = data as ClipRow
  if (clip.status !== 'pending') {
    throw new Error(`Clip ${clip.id} must remain pending review before rendering; found ${clip.status}.`)
  }
  if (clip.approved_at || clip.manually_published_at) {
    throw new Error('Rendering refused because clip already has approval or publish metadata.')
  }

  const notes = normalizeStringArray(clip.moderation_notes)
  const startSeconds = readTimedNote(notes, 'candidate_start_seconds')
  const endSeconds = readTimedNote(notes, 'candidate_end_seconds')
  if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) {
    throw new Error('Clip render requires real candidate_start_seconds/candidate_end_seconds notes.')
  }

  const clipLength = endSeconds - startSeconds
  if (clipLength < 1 || clipLength > 60) {
    throw new Error(`TikTok render length must be 1-60 seconds; received ${clipLength}.`)
  }

  const sourceUrl = clip.source_url?.trim() || clip.video_url?.trim()
  if (!sourceUrl) {
    throw new Error('Clip render requires a source video URL or local source path.')
  }

  const rootOutputDir = input.outputDir ?? path.join(process.cwd(), 'tmp', 'rendered-clips')
  const workDir = path.join(rootOutputDir, '.work')
  await fs.mkdir(rootOutputDir, { recursive: true })
  await fs.mkdir(workDir, { recursive: true })

  const sourcePath = await resolveSourceMedia({ sourceUrl, clipId: clip.id, workDir })
  const outputPath = path.join(rootOutputDir, `${sanitizeFileStem(clip.id)}.mp4`)
  const durationSeconds = Math.min(60, Math.max(1, clipLength))

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-ss',
      String(startSeconds),
      '-i',
      sourcePath,
      '-t',
      String(durationSeconds),
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-vf',
      'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p',
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

  const stat = await fs.stat(outputPath)
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error('ffmpeg did not produce a non-empty TikTok MP4.')
  }

  const media = await probeMedia(outputPath)
  const probedDuration = media.durationSeconds
  const width = media.width ?? 1080
  const height = media.height ?? 1920
  const now = new Date().toISOString()
  const riskFlags = normalizeStringArray(clip.risk_flags)
    .filter((flag) => flag !== 'needs_clip_render' && flag !== 'render_failed')
  const nextNotes = [
    ...notes.filter((note) => !note.startsWith('rendered_tiktok_mp4:') && !note.startsWith('render_status:')),
    `rendered_tiktok_mp4:${outputPath}`,
    `render_status:rendered_local_mp4`,
    `render_duration_seconds:${probedDuration || durationSeconds}`,
    `render_size_bytes:${stat.size}`,
    `render_width:${width}`,
    `render_height:${height}`,
    `render_mime_type:video/mp4`,
    `render_format:mp4`,
    'Manual approval still required before export or n8n handoff.',
  ]

  const { error: updateError } = await supabase
    .from('clips')
    .update({
      video_url: outputPath,
      duration_seconds: Math.round(probedDuration || durationSeconds),
      moderation_notes: nextNotes,
      risk_flags: [...new Set([...riskFlags, 'rendered_local_mp4', 'needs_manual_approval'])],
      publish_status: clip.publish_status || 'not_ready',
      updated_at: now,
    })
    .eq('id', clip.id)
    .eq('status', 'pending')

  if (updateError) {
    throw new Error(updateError.message)
  }

  return {
    clipId: clip.id,
    status: 'rendered',
    outputPath,
    durationSeconds: probedDuration || durationSeconds,
    sizeBytes: stat.size,
    width,
    height,
    mimeType: 'video/mp4',
    format: 'mp4',
    startSeconds,
    endSeconds,
  }
}
