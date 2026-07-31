import type { SupabaseClient } from '@supabase/supabase-js'

import { deleteStoredPlatformMp4Asset } from './media-storage'

type AssetRetentionDb = Pick<SupabaseClient, 'from'>

export type AssetStorageProvider = 'r2' | 'local_dev'

export type AssetDeleteStatus =
  | 'pending'
  | 'deleted'
  | 'failed'
  | 'skipped_pending_publish'
  | 'skipped_local_dev'
  | 'skipped_missing_storage_key'

type ExpiredClipAssetRow = {
  id: string
  publish_status: string | null
  asset_storage_provider: string | null
  asset_storage_key: string | null
  asset_public_url: string | null
  asset_expires_at: string | null
  asset_deleted_at: string | null
}

export type AssetCleanupResult = {
  scanned: number
  deleted: number
  skipped: number
  failed: number
  results: Array<{
    clipId: string
    storageProvider: string | null
    storageKey: string | null
    status: AssetDeleteStatus
    error: string | null
  }>
}

const RETENTION_DAYS = 3

const PENDING_PUBLISH_STATUSES = new Set([
  'queued',
  'scheduled',
  'sent_to_n8n',
  'automation_queued',
  'metricool_scheduled',
])

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000)
}

function compactError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value)
  return message.replace(/\s+/g, ' ').trim().slice(0, 500)
}

export function assetExpiresAt(input: { now?: Date; scheduledPublishTime?: string | Date | null } = {}): string {
  const base = input.scheduledPublishTime
    ? new Date(input.scheduledPublishTime)
    : input.now ?? new Date()
  const safeBase = Number.isFinite(base.getTime()) ? base : input.now ?? new Date()
  return addDays(safeBase, RETENTION_DAYS).toISOString()
}

export function assetCreatedAt(input: { now?: Date } = {}): string {
  return (input.now ?? new Date()).toISOString()
}

export function isPendingPublishStatus(value: string | null | undefined): boolean {
  return PENDING_PUBLISH_STATUSES.has(value ?? '')
}

function linkedPackageUpdate(storageKey: string | null, update: Record<string, unknown>) {
  if (!storageKey) return null
  return {
    ...update,
    updated_at: new Date().toISOString(),
  }
}

async function updatePackageRowsByStorageKey(
  db: AssetRetentionDb,
  storageKey: string | null,
  update: Record<string, unknown>,
) {
  const payload = linkedPackageUpdate(storageKey, update)
  if (!storageKey || !payload) return
  const { error } = await (db as any)
    .from('mac_mini_clip_packages')
    .update(payload)
    .eq('asset_storage_key', storageKey)
  if (error) throw new Error(error.message)
}

async function updateClipAssetDeleteStatus(
  db: AssetRetentionDb,
  clipId: string,
  storageKey: string | null,
  update: Record<string, unknown>,
) {
  const { error } = await (db as any)
    .from('clips')
    .update(update)
    .eq('id', clipId)
  if (error) throw new Error(error.message)
  await updatePackageRowsByStorageKey(db, storageKey, update)
}

export async function extendClipAssetRetentionForSchedule(
  db: AssetRetentionDb,
  input: { clipId: string; scheduledPublishTime: string | Date; now?: Date },
): Promise<{ ok: boolean; assetExpiresAt: string; storageKey: string | null }> {
  const expiresAt = assetExpiresAt({
    now: input.now,
    scheduledPublishTime: input.scheduledPublishTime,
  })
  const { data, error } = await (db as any)
    .from('clips')
    .select('id, asset_storage_key')
    .eq('id', input.clipId)
    .maybeSingle()
  if (error) throw new Error(error.message)

  const storageKey = typeof data?.asset_storage_key === 'string' ? data.asset_storage_key : null
  const update = {
    asset_expires_at: expiresAt,
    asset_delete_status: 'pending',
    asset_delete_error: null,
  }

  await updateClipAssetDeleteStatus(db, input.clipId, storageKey, update)
  return { ok: true, assetExpiresAt: expiresAt, storageKey }
}

export async function cleanupExpiredAssets(
  db: AssetRetentionDb,
  input: {
    now?: Date
    limit?: number
    deleteObject?: (storageKey: string) => Promise<void>
  } = {},
): Promise<AssetCleanupResult> {
  const now = input.now ?? new Date()
  const limit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100)))
  const deleteObject = input.deleteObject ?? (async (storageKey: string) => {
    await deleteStoredPlatformMp4Asset({ objectKey: storageKey, storageMode: 'r2' })
  })

  const { data, error } = await (db as any)
    .from('clips')
    .select('id, publish_status, asset_storage_provider, asset_storage_key, asset_public_url, asset_expires_at, asset_deleted_at')
    .lte('asset_expires_at', now.toISOString())
    .is('asset_deleted_at', null)
    .order('asset_expires_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as ExpiredClipAssetRow[]
  const result: AssetCleanupResult = {
    scanned: rows.length,
    deleted: 0,
    skipped: 0,
    failed: 0,
    results: [],
  }

  for (const row of rows) {
    const storageKey = row.asset_storage_key?.trim() || null
    const storageProvider = row.asset_storage_provider?.trim() || null

    try {
      if (isPendingPublishStatus(row.publish_status)) {
        const status: AssetDeleteStatus = 'skipped_pending_publish'
        await updateClipAssetDeleteStatus(db, row.id, storageKey, {
          asset_delete_status: status,
          asset_delete_error: null,
        })
        result.skipped += 1
        result.results.push({ clipId: row.id, storageProvider, storageKey, status, error: null })
        continue
      }

      if (storageProvider !== 'r2') {
        const status: AssetDeleteStatus = 'skipped_local_dev'
        await updateClipAssetDeleteStatus(db, row.id, storageKey, {
          asset_delete_status: status,
          asset_delete_error: 'Only durable R2 assets are deleted by cleanup.',
        })
        result.skipped += 1
        result.results.push({ clipId: row.id, storageProvider, storageKey, status, error: null })
        continue
      }

      if (!storageKey) {
        const status: AssetDeleteStatus = 'skipped_missing_storage_key'
        await updateClipAssetDeleteStatus(db, row.id, storageKey, {
          asset_delete_status: status,
          asset_delete_error: 'Durable asset storage key is missing.',
        })
        result.skipped += 1
        result.results.push({ clipId: row.id, storageProvider, storageKey, status, error: null })
        continue
      }

      await deleteObject(storageKey)
      const status: AssetDeleteStatus = 'deleted'
      const deletedAt = now.toISOString()
      await updateClipAssetDeleteStatus(db, row.id, storageKey, {
        asset_deleted_at: deletedAt,
        asset_delete_status: status,
        asset_delete_error: null,
      })
      result.deleted += 1
      result.results.push({ clipId: row.id, storageProvider, storageKey, status, error: null })
    } catch (deleteError) {
      const status: AssetDeleteStatus = 'failed'
      const message = compactError(deleteError)
      await updateClipAssetDeleteStatus(db, row.id, storageKey, {
        asset_delete_status: status,
        asset_delete_error: message,
      }).catch(() => undefined)
      result.failed += 1
      result.results.push({ clipId: row.id, storageProvider, storageKey, status, error: message })
    }
  }

  return result
}
