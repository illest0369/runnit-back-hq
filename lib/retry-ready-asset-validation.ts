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
  reason: string | null
}

function readDurationSeconds(value: unknown): number | null {
  const duration = value && typeof value === 'object'
    ? (value as { format?: { duration?: unknown } }).format?.duration
    : null
  const parsed = typeof duration === 'number'
    ? duration
    : typeof duration === 'string' && duration.trim()
      ? Number(duration)
      : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(3)) : null
}

export async function validateRetryReadyLocalAsset(assetPath: string | null | undefined): Promise<RetryReadyAssetValidation> {
  const clean = assetPath?.trim() || ''
  if (!clean) {
    return {
      asset_validation: 'missing',
      locallyVerified: false,
      assetPath: null,
      durationSeconds: null,
      reason: 'Local asset path is missing.',
    }
  }

  const absolutePath = path.resolve(clean)
  const fileStat = await stat(absolutePath).catch((error: unknown) => {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  })
  if (!fileStat) {
    return {
      asset_validation: 'missing',
      locallyVerified: false,
      assetPath: absolutePath,
      durationSeconds: null,
      reason: 'Local asset file does not exist.',
    }
  }
  if (!fileStat.isFile()) {
    return {
      asset_validation: 'unreadable',
      locallyVerified: false,
      assetPath: absolutePath,
      durationSeconds: null,
      reason: 'Local asset path is not a regular file.',
    }
  }

  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', absolutePath],
      { maxBuffer: 1024 * 1024 },
    )
    const durationSeconds = readDurationSeconds(JSON.parse(stdout))
    if (durationSeconds === null) {
      return {
        asset_validation: 'unreadable',
        locallyVerified: false,
        assetPath: absolutePath,
        durationSeconds: null,
        reason: 'ffprobe did not report a positive video duration.',
      }
    }
    return {
      asset_validation: 'verified',
      locallyVerified: true,
      assetPath: absolutePath,
      durationSeconds,
      reason: null,
    }
  } catch (error) {
    return {
      asset_validation: 'unreadable',
      locallyVerified: false,
      assetPath: absolutePath,
      durationSeconds: null,
      reason: error instanceof Error ? `ffprobe could not read local asset: ${error.message}` : 'ffprobe could not read local asset.',
    }
  }
}
