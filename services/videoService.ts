import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import { runCommand } from './processService'

type DownloadedVideo = {
  sourceId: string
  sourcePath: string
  workspaceTmpDir: string
}

type ClipCutInput = {
  inputPath: string
  outputPath: string
  startTime: number
  endTime: number
  captionText?: string
}

const YT_DLP_COOKIES_PATH = '/tmp/youtube-cookies.txt'
const RAILWAY_YT_DLP_PATH = '/usr/local/bin/yt-dlp'

async function getYtDlpBinary() {
  try {
    await access(RAILWAY_YT_DLP_PATH)
    return RAILWAY_YT_DLP_PATH
  } catch {
    return 'yt-dlp'
  }
}

export function getWorkspaceRoot() {
  return process.cwd()
}

export function getTmpRoot() {
  const configuredTmpDir = process.env.TMP_DIR?.trim()

  if (!configuredTmpDir) {
    return '/tmp/runnit-back'
  }

  if (path.isAbsolute(configuredTmpDir)) {
    return configuredTmpDir
  }

  return path.resolve('/tmp', configuredTmpDir)
}

export function getGeneratedClipDir() {
  return path.join(getTmpRoot(), 'generated-clips')
}

export async function ensureClipDirectories() {
  await Promise.all([
    mkdir(getTmpRoot(), { recursive: true }),
    mkdir(getGeneratedClipDir(), { recursive: true }),
  ])
}

export async function downloadVideo(videoUrl: string, jobId: string): Promise<DownloadedVideo> {
  await ensureClipDirectories()

  const workspaceTmpDir = path.join(getTmpRoot(), jobId)
  await mkdir(workspaceTmpDir, { recursive: true })

  const ytDlpBinary = await getYtDlpBinary()
  const version = (await runCommand(ytDlpBinary, ['--version'])).stdout.trim()
  const cookies = process.env.YT_DLP_COOKIES?.trim()
  const cookiesEnabled = Boolean(cookies)

  if (cookies) {
    await writeFile(YT_DLP_COOKIES_PATH, cookies, { mode: 0o600 })
  }

  console.log('[yt-dlp] download config', {
    version,
    cookiesEnabled,
    sourceUrl: videoUrl,
  })

  const outputTemplate = path.join(workspaceTmpDir, '%(id)s.%(ext)s')
  const cookieArgs = cookiesEnabled ? ['--cookies', YT_DLP_COOKIES_PATH] : []
  const { stdout } = await runCommand(ytDlpBinary, [
    '--no-playlist',
    '--no-update',
    ...cookieArgs,
    '--merge-output-format',
    'mp4',
    '--print',
    'after_move:filepath',
    '-f',
    'mp4/best[ext=mp4]/best',
    '-o',
    outputTemplate,
    videoUrl,
  ])

  const sourcePath = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)

  if (!sourcePath) {
    throw new Error('yt-dlp did not return a downloaded video path.')
  }

  return {
    sourceId: path.basename(sourcePath, path.extname(sourcePath)),
    sourcePath,
    workspaceTmpDir,
  }
}

export async function cutVerticalClip(input: ClipCutInput) {
  await ensureClipDirectories()

  const videoFilters = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
  const commandArgs = [
    '-y',
    '-ss',
    input.startTime.toFixed(2),
    '-to',
    input.endTime.toFixed(2),
    '-i',
    input.inputPath,
  ]

  if (input.captionText?.trim()) {
    const captionPath = `${input.outputPath}.caption.png`
    await writeCaptionOverlay(captionPath, input.captionText)
    commandArgs.push(
      '-i',
      captionPath,
      '-filter_complex',
      `[0:v]${videoFilters}[base];[base][1:v]overlay=(W-w)/2:H-h-170[v]`,
      '-map',
      '[v]',
      '-map',
      '0:a?',
    )
  } else {
    commandArgs.push('-vf', videoFilters)
  }

  await runCommand('ffmpeg', [
    ...commandArgs,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    input.outputPath,
  ])
}

function wrapCaptionText(text: string) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > 28 && current) {
      lines.push(current)
      current = word
      continue
    }

    current = next
  }

  if (current) {
    lines.push(current)
  }

  return lines.slice(0, 4).join('\n')
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function writeCaptionOverlay(outputPath: string, captionText: string) {
  const lines = wrapCaptionText(captionText).split('\n').filter(Boolean)
  const width = 960
  const lineHeight = 70
  const paddingY = 34
  const height = Math.max(130, lines.length * lineHeight + paddingY * 2)
  const firstY = paddingY + 50
  const text = lines
    .map(
      (line, index) =>
        `<text x="480" y="${firstY + index * lineHeight}" text-anchor="middle">${escapeXml(line)}</text>`,
    )
    .join('')
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="30" fill="rgba(0,0,0,0.62)" />
      <g font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="800" fill="#ffffff">${text}</g>
    </svg>
  `

  await sharp(Buffer.from(svg)).png().toFile(outputPath)
}

export async function findGeneratedJsonFile(outputDir: string, basename: string) {
  const candidates = await readdir(outputDir)
  const match = candidates.find((entry) => entry === `${basename}.json`)

  if (!match) {
    throw new Error('Whisper did not create a transcript JSON file.')
  }

  return path.join(outputDir, match)
}
