import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { runCommand } from './processService'
import { findGeneratedJsonFile } from './videoService'

export type TranscriptSegment = {
  start: number
  end: number
  text: string
}

type WhisperTranscript = {
  text?: string
  segments?: Array<{
    start?: number
    end?: number
    text?: string
  }>
}

export async function transcribeVideo(videoPath: string, outputDir: string) {
  const modelDir = process.env.WHISPER_MODEL_DIR?.trim() || path.join(outputDir, 'whisper-models')
  await mkdir(modelDir, { recursive: true })

  await runCommand('whisper', [
    videoPath,
    '--model',
    'base',
    '--model_dir',
    modelDir,
    '--output_format',
    'json',
    '--output_dir',
    outputDir,
  ])

  const basename = path.basename(videoPath, path.extname(videoPath))
  const transcriptPath = await findGeneratedJsonFile(outputDir, basename)
  const raw = await readFile(transcriptPath, 'utf8')
  const parsed = JSON.parse(raw) as WhisperTranscript

  const segments = (parsed.segments ?? [])
    .map((segment) => ({
      start: typeof segment.start === 'number' ? segment.start : 0,
      end: typeof segment.end === 'number' ? segment.end : 0,
      text: typeof segment.text === 'string' ? segment.text.trim() : '',
    }))
    .filter((segment) => segment.text && segment.end > segment.start)

  if (segments.length > 0) {
    return {
      transcriptPath,
      text: parsed.text?.trim() || segments.map((segment) => segment.text).join(' '),
      segments,
    }
  }

  const fallbackText = parsed.text?.trim() || ''
  if (!fallbackText) {
    throw new Error('Whisper returned an empty transcript.')
  }

  return {
    transcriptPath,
    text: fallbackText,
    segments: [
      {
        start: 0,
        end: 12,
        text: fallbackText,
      },
    ],
  }
}
