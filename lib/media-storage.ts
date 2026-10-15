import path from 'node:path'
import { rm } from 'node:fs/promises'

import { copyGeneratedClipToStorage, deleteR2Object } from './clip-storage'
import { assertChannelStorageKey, buildChannelStorageKey } from './channel-scope'
import { validateRetryReadyLocalAsset } from './retry-ready-asset-validation'

export type PlatformMediaStorageMode = 'r2' | 'local_dev'

export type StoredPlatformMediaAsset = {
  publicUrl: string
  cdnUrl: string | null
  localUrl: string | null
  storageMode: PlatformMediaStorageMode
  objectKey: string
  channelId: string
  sourceLocalPath: string
  durationSeconds: number
  width: number
  height: number
  videoCodec: string
  audioCodec: string | null
  formatName: string | null
}

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production'
}

export function isDurablePublicPlatformAsset(asset: Pick<StoredPlatformMediaAsset, 'publicUrl' | 'storageMode'>): boolean {
  return asset.storageMode === 'r2' && /^https?:\/\//i.test(asset.publicUrl)
}

export function assertProductionReadyPlatformAsset(asset: Pick<StoredPlatformMediaAsset, 'publicUrl' | 'storageMode'>): void {
  if (!isProductionRuntime()) return
  if (isDurablePublicPlatformAsset(asset)) return

  throw new Error('Production platform export requires durable public R2 storage.')
}

function safeSegment(value: string | null | undefined): string {
  const clean = value?.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') ?? ''
  return clean || 'unrouted'
}

function objectKeyFor(input: {
  localPath: string
  packageId: string
  laneSlug?: string | null
  channelId: string
}) {
  const ext = path.extname(input.localPath).toLowerCase() || '.mp4'
  const basename = path.basename(input.localPath, path.extname(input.localPath))
  return buildChannelStorageKey({
    channelId: input.channelId,
    category: 'platform-packages',
    segments: [
      safeSegment(input.laneSlug),
      safeSegment(input.packageId),
      `${safeSegment(basename)}${ext}`,
    ],
  })
}

export async function storePlatformMp4Asset(input: {
  localPath: string
  packageId: string
  laneSlug?: string | null
  channelId: string
}): Promise<StoredPlatformMediaAsset> {
  const validation = await validateRetryReadyLocalAsset(input.localPath)
  if (
    validation.asset_validation !== 'verified' ||
    !validation.locallyVerified ||
    !validation.assetPath ||
    validation.durationSeconds === null ||
    validation.width === null ||
    validation.height === null ||
    !validation.videoCodec
  ) {
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
  const storageMode = stored.storageMode === 'r2' ? 'r2' : 'local_dev'
  const asset = {
    publicUrl: stored.publicUrl,
    cdnUrl: stored.cdnUrl,
    localUrl: stored.localUrl,
    storageMode,
    objectKey,
    channelId: input.channelId,
    sourceLocalPath: validation.assetPath,
    durationSeconds: validation.durationSeconds,
    width: validation.width,
    height: validation.height,
    videoCodec: validation.videoCodec,
    audioCodec: validation.audioCodec,
    formatName: validation.formatName,
  } satisfies StoredPlatformMediaAsset

  assertProductionReadyPlatformAsset(asset)
  return asset
}

export async function deleteStoredPlatformMp4Asset(
  asset: Pick<StoredPlatformMediaAsset, 'objectKey' | 'storageMode' | 'channelId'>,
): Promise<void> {
  assertChannelStorageKey(asset.channelId, asset.objectKey)
  if (!asset.objectKey.includes('/platform-packages/')) {
    throw new Error('Refusing to delete a media asset outside channel-scoped platform packages.')
  }

  if (asset.storageMode === 'r2') {
    await deleteR2Object(asset.objectKey)
    return
  }

  const localPath = path.join(process.cwd(), 'public', 'generated-clips', asset.objectKey)
  await rm(localPath, { force: true })
}
