import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const YT_DLP_TIMEOUT_MS = 45_000

export type TimedTranscriptSegment = {
  start: number
  duration: number
  end: number
  text: string
}

export type TranscriptAcquisitionResult =
  | {
      ok: true
      source: 'yt-dlp-subtitles'
      language: string | null
      transcriptText: string
      segments: TimedTranscriptSegment[]
    }
  | {
      ok: false
      source: 'yt-dlp-subtitles'
      reason: string
    }

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function toSeconds(value: string): number | null {
  const match = value.match(/(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/)
  if (!match) return null
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const millis = Number(match[4])
  const total = hours * 3600 + minutes * 60 + seconds + millis / 1000
  return Number.isFinite(total) ? total : null
}

function segment(start: number, end: number, text: string): TimedTranscriptSegment | null {
  const clean = cleanText(text)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !clean) return null
  return {
    start: Number(start.toFixed(3)),
    duration: Number((end - start).toFixed(3)),
    end: Number(end.toFixed(3)),
    text: clean,
  }
}

function parseJson3(input: string): TimedTranscriptSegment[] {
  const parsed = JSON.parse(input) as { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> }
  const segments: TimedTranscriptSegment[] = []

  for (const event of parsed.events ?? []) {
    const text = (event.segs ?? []).map((item) => item.utf8 ?? '').join('')
    const start = Number(event.tStartMs) / 1000
    const duration = Number(event.dDurationMs) / 1000
    const end = start + duration
    const next = segment(start, end, text)
    if (next) segments.push(next)
  }

  return segments
}

function parseVtt(input: string): TimedTranscriptSegment[] {
  const segments: TimedTranscriptSegment[] = []
  const blocks = input.split(/\n\s*\n/g)

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const timeLineIndex = lines.findIndex((line) => line.includes('-->'))
    if (timeLineIndex < 0) continue

    const [rawStart, rawEnd] = lines[timeLineIndex].split('-->').map((value) => value.trim().split(/\s+/)[0])
    const start = toSeconds(rawStart ?? '')
    const end = toSeconds(rawEnd ?? '')
    if (start === null || end === null) continue

    const text = lines.slice(timeLineIndex + 1).join(' ')
    const next = segment(start, end, text)
    if (next) segments.push(next)
  }

  return segments
}

function languageFromFile(filePath: string): string | null {
  const base = path.basename(filePath)
  const match = base.match(/transcript\.([^.]+(?:\.[^.]+)*)\.(?:json3|vtt)$/)
  return match?.[1] ?? null
}

async function readTranscriptFiles(directory: string): Promise<{ filePath: string; segments: TimedTranscriptSegment[] } | null> {
  const files = (await fs.readdir(directory))
    .filter((file) => file.startsWith('transcript.') && (file.endsWith('.json3') || file.endsWith('.vtt')))
    .sort((a, b) => {
      const score = (file: string) => file.endsWith('.json3') ? 0 : 1
      return score(a) - score(b)
    })

  for (const file of files) {
    const filePath = path.join(directory, file)
    const text = await fs.readFile(filePath, 'utf8')
    const segments = file.endsWith('.json3') ? parseJson3(text) : parseVtt(text)
    if (segments.length > 0) return { filePath, segments }
  }

  return null
}

export async function acquireYouTubeTranscript(videoUrl: string): Promise<TranscriptAcquisitionResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbhq-transcript-'))
  try {
    await execFileAsync(
      'yt-dlp',
      [
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs',
        'en.*,en',
        '--sub-format',
        'json3/vtt',
        '--no-playlist',
        '--output',
        'transcript.%(ext)s',
        videoUrl,
      ],
      { cwd: tempDir, timeout: YT_DLP_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 },
    )

    const transcript = await readTranscriptFiles(tempDir)
    if (!transcript) {
      return {
        ok: false,
        source: 'yt-dlp-subtitles',
        reason: 'No timed captions/subtitles were returned by yt-dlp.',
      }
    }

    return {
      ok: true,
      source: 'yt-dlp-subtitles',
      language: languageFromFile(transcript.filePath),
      transcriptText: transcript.segments.map((item) => item.text).join(' '),
      segments: transcript.segments,
    }
  } catch (error) {
    return {
      ok: false,
      source: 'yt-dlp-subtitles',
      reason: error instanceof Error ? error.message : 'Transcript acquisition failed.',
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}
