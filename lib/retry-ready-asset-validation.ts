import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type RetryReadyAssetValidationStatus = 'verified' | 'missing' | 'unreadable'

export type RetryReadyAssetValidation = {
  asset_validation: RetryReadyAssetValidationStatus
  locallyVerified: boolean
  assetPath: string | null
  durationSeconds: number | null
  width: number | null
  height: number | null
  videoCodec: string | null
  audioCodec: string | null
  formatName: string | null
  reason: string | null
}

function readPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = readPositiveNumber(value)
  return parsed === null ? null : Math.round(parsed)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readProbe(value: unknown): Omit<RetryReadyAssetValidation, 'asset_validation' | 'locallyVerified' | 'assetPath' | 'reason'> {
  const record = value && typeof value === 'object'
    ? value as { streams?: unknown; format?: { duration?: unknown; format_name?: unknown } }
    : {}
  const streams = Array.isArray(record.streams) ? record.streams : []
  const video = streams.find((stream): stream is Record<string, unknown> =>
    Boolean(stream && typeof stream === 'object' && (stream as { codec_type?: unknown }).codec_type === 'video'),
  )
  const audio = streams.find((stream): stream is Record<string, unknown> =>
    Boolean(stream && typeof stream === 'object' && (stream as { codec_type?: unknown }).codec_type === 'audio'),
  )

  const duration = readPositiveNumber(video?.duration) ?? readPositiveNumber(record.format?.duration)

  return {
    durationSeconds: duration === null ? null : Number(duration.toFixed(3)),
    width: readPositiveInteger(video?.width),
    height: readPositiveInteger(video?.height),
    videoCodec: readString(video?.codec_name),
    audioCodec: readString(audio?.codec_name),
    formatName: readString(record.format?.format_name),
  }
}

function missingValidation(
  assetPath: string | null,
  reason: string,
  status: RetryReadyAssetValidationStatus = 'missing',
): RetryReadyAssetValidation {
  return {
    asset_validation: status,
    locallyVerified: false,
    assetPath,
    durationSeconds: null,
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: null,
    formatName: null,
    reason,
  }
}

export async function validateRetryReadyLocalAsset(assetPath: string | null | undefined): Promise<RetryReadyAssetValidation> {
  const clean = assetPath?.trim() || ''
  if (!clean) {
    return missingValidation(null, 'Local asset path is missing.')
  }

  const absolutePath = path.resolve(clean)
  const fileStat = await stat(absolutePath).catch((error: unknown) => {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  })
  if (!fileStat) {
    return missingValidation(absolutePath, 'Local asset file does not exist.')
  }
  if (!fileStat.isFile()) {
    return missingValidation(absolutePath, 'Local asset path is not a regular file.', 'unreadable')
  }

  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', absolutePath],
      { maxBuffer: 1024 * 1024 },
    )
    const probe = readProbe(JSON.parse(stdout))
    if (probe.durationSeconds === null) {
      return missingValidation(absolutePath, 'ffprobe did not report a positive video duration.', 'unreadable')
    }
    if (probe.width === null || probe.height === null || !probe.videoCodec) {
      return missingValidation(absolutePath, 'ffprobe did not report readable video stream metadata.', 'unreadable')
    }
    return {
      asset_validation: 'verified',
      locallyVerified: true,
      assetPath: absolutePath,
      ...probe,
      reason: null,
    }
  } catch (error) {
    return missingValidation(
      absolutePath,
      error instanceof Error ? `ffprobe could not read local asset: ${error.message}` : 'ffprobe could not read local asset.',
      'unreadable',
    )
  }
}
