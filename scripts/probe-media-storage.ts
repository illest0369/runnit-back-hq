import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { config } from 'dotenv'

import { getR2StorageConfigStatus } from '../lib/clip-storage'
import { deleteStoredPlatformMp4Asset, storePlatformMp4Asset, type StoredPlatformMediaAsset } from '../lib/media-storage'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

const execFileAsync = promisify(execFile)

type PublicUrlVerification = {
  method: 'http_fetch' | 'local_file_stat' | 'not_available'
  ok: boolean
  status: number | null
  detail: string | null
}

type ProbeStatus =
  | 'local_dev_storage'
  | 'durable_storage_configured'
  | 'durable_storage_missing_env'
  | 'durable_storage_probe_passed'
  | 'durable_storage_probe_failed'

async function createSafeFixtureMp4(outputPath: string) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=180x320:rate=12',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t',
    '1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    outputPath,
  ], { maxBuffer: 1024 * 1024 })
}

function localPublicPath(publicUrl: string): string | null {
  if (!publicUrl.startsWith('/generated-clips/')) return null
  return path.join(process.cwd(), 'public', publicUrl)
}

async function verifyPublicUrl(asset: StoredPlatformMediaAsset): Promise<PublicUrlVerification> {
  if (asset.publicUrl.startsWith('http://') || asset.publicUrl.startsWith('https://')) {
    try {
      const response = await fetch(asset.publicUrl, {
        headers: { range: 'bytes=0-31' },
      })
      await response.arrayBuffer().catch(() => null)
      return {
        method: 'http_fetch',
        ok: response.ok || response.status === 206,
        status: response.status,
        detail: response.ok || response.status === 206
          ? 'Public MP4 URL responded to a safe ranged fetch.'
          : `Public MP4 URL returned ${response.status} ${response.statusText}.`,
      }
    } catch (error) {
      return {
        method: 'http_fetch',
        ok: false,
        status: null,
        detail: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const filePath = localPublicPath(asset.publicUrl)
  if (!filePath) {
    return {
      method: 'not_available',
      ok: false,
      status: null,
      detail: 'Storage returned a non-HTTP URL that is not a local generated-clips path.',
    }
  }

  const fileStat = await stat(filePath).catch(() => null)
  return {
    method: 'local_file_stat',
    ok: Boolean(fileStat?.isFile() && fileStat.size > 0),
    status: null,
    detail: fileStat?.isFile()
      ? `Local generated-clips file exists (${fileStat.size} bytes).`
      : 'Local generated-clips file is missing.',
  }
}

async function cleanupAsset(asset: StoredPlatformMediaAsset | null): Promise<{ attempted: boolean; ok: boolean; error: string | null }> {
  if (!asset) return { attempted: false, ok: true, error: null }
  try {
    await deleteStoredPlatformMp4Asset(asset)
    return { attempted: true, ok: true, error: null }
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'rbhq-media-storage-probe-'))
  const fixturePath = path.join(tempDir, 'safe-storage-probe.mp4')
  const configStatus = getR2StorageConfigStatus()
  let asset: StoredPlatformMediaAsset | null = null
  let verification: PublicUrlVerification = {
    method: 'not_available',
    ok: false,
    status: null,
    detail: null,
  }
  let probeError: string | null = null
  let cleanup = { attempted: false, ok: true, error: null as string | null }

  try {
    await createSafeFixtureMp4(fixturePath)
    asset = await storePlatformMp4Asset({
      localPath: fixturePath,
      packageId: `media-storage-probe-${randomUUID()}`,
      laneSlug: 'storage-probe',
      channelId: 'a1000000-0000-0000-0000-000000000001',
    })
    verification = await verifyPublicUrl(asset)
  } catch (error) {
    probeError = error instanceof Error ? error.message : String(error)
  } finally {
    cleanup = await cleanupAsset(asset)
    await rm(tempDir, { recursive: true, force: true })
  }

  const localDevStorage = asset?.storageMode === 'local_dev'
  const durableStorageConfigured = configStatus.durableStorageConfigured
  const durableStorageMissingEnv = configStatus.missingEnvNames.length > 0
  const durableStorageProbePassed = Boolean(
    asset?.storageMode === 'r2' &&
    verification.ok &&
    !probeError,
  )
  const durableStorageProbeFailed = Boolean(
    durableStorageConfigured &&
    (!asset || asset.storageMode !== 'r2' || !verification.ok || probeError),
  )
  const statuses: ProbeStatus[] = []
  if (localDevStorage) statuses.push('local_dev_storage')
  if (durableStorageConfigured) statuses.push('durable_storage_configured')
  if (durableStorageMissingEnv) statuses.push('durable_storage_missing_env')
  if (durableStorageProbePassed) statuses.push('durable_storage_probe_passed')
  if (durableStorageProbeFailed) statuses.push('durable_storage_probe_failed')

  console.log(JSON.stringify({
    result: probeError && !asset ? 'FAIL' : 'PASS',
    statuses,
    backend: {
      durable: 'r2',
      detectedStorageMode: asset?.storageMode ?? null,
      durableStorageConfigured,
      missingRequiredEnvNames: configStatus.missingEnvNames,
      requiredEnvNames: [
        ...configStatus.presentEnvNames,
        ...configStatus.missingEnvNames,
      ].sort(),
      optionalEnvNames: configStatus.optionalEnvNames,
      valuesHidden: true,
    },
    probe: {
      objectKey: asset?.objectKey ?? null,
      publicUrl: asset?.publicUrl ?? null,
      durationSeconds: asset?.durationSeconds ?? null,
      error: probeError,
    },
    publicDownloadVerification: verification,
    cleanup,
    productionMediaStorageReady: durableStorageProbePassed,
    localFallbackWorking: localDevStorage && verification.ok && !probeError,
    safety: {
      fixtureOnly: true,
      requiresRealClip: false,
      callsMetricool: false,
      uploadsToTikTok: false,
      uploadsToInstagram: false,
      uploadsToYouTube: false,
      livePublish: false,
    },
  }, null, 2))

  if (probeError && !asset && !durableStorageConfigured) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
