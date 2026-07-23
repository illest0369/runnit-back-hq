import path from 'node:path'

import { copyGeneratedClipToStorage } from './clip-storage'
import { validateRetryReadyLocalAsset } from './retry-ready-asset-validation'

export type PlatformMediaStorageMode = 'r2' | 'local_dev'

export type StoredPlatformMediaAsset = {
  publicUrl: string
  cdnUrl: string | null
  localUrl: string | null
  storageMode: PlatformMediaStorageMode
  objectKey: string
  sourceLocalPath: string
  durationSeconds: number
}

function safeSegment(value: string | null | undefined): string {
  const clean = value?.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') ?? ''
  return clean || 'unrouted'
}

function objectKeyFor(input: {
  localPath: string
  packageId: string
  laneSlug?: string | null
  channelId?: string | null
}) {
  const ext = path.extname(input.localPath).toLowerCase() || '.mp4'
  const basename = path.basename(input.localPath, path.extname(input.localPath))
  return [
    'platform-packages',
    safeSegment(input.laneSlug ?? input.channelId),
    safeSegment(input.packageId),
    `${safeSegment(basename)}${ext}`,
  ].join('/')
}

export async function storePlatformMp4Asset(input: {
  localPath: string
  packageId: string
  laneSlug?: string | null
  channelId?: string | null
}): Promise<StoredPlatformMediaAsset> {
  const validation = await validateRetryReadyLocalAsset(input.localPath)
  if (validation.asset_validation !== 'verified' || !validation.locallyVerified || !validation.assetPath || validation.durationSeconds === null) {
    throw new Error(validation.reason || 'Local asset is not a readable MP4.')
  }
  if (!validation.assetPath.toLowerCase().endsWith('.mp4')) {
    throw new Error('Platform asset must be an .mp4 file.')
  }

  const objectKey = objectKeyFor({
    localPath: validation.assetPath,
    packageId: input.packageId,
    laneSlug: input.laneSlug,
    channelId: input.channelId,
  })
  const stored = await copyGeneratedClipToStorage(validation.assetPath, objectKey)

  return {
    publicUrl: stored.publicUrl,
    cdnUrl: stored.cdnUrl,
    localUrl: stored.localUrl,
    storageMode: stored.storageMode === 'r2' ? 'r2' : 'local_dev',
    objectKey,
    sourceLocalPath: validation.assetPath,
    durationSeconds: validation.durationSeconds,
  }
}
