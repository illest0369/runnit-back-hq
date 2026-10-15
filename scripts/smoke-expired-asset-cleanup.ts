import assert from 'node:assert/strict'

import { cleanupExpiredAssets } from '../lib/asset-retention'

type TableName = 'clips' | 'mac_mini_clip_packages'
type MemoryTables = Record<TableName, Array<Record<string, unknown>>>

class MemoryQuery {
  private filters: Array<(row: Record<string, unknown>) => boolean> = []
  private updatePayload: Record<string, unknown> | null = null
  private limitCount: number | null = null

  constructor(private tables: MemoryTables, private table: TableName) {}

  select() {
    return this
  }

  update(payload: Record<string, unknown>) {
    this.updatePayload = payload
    return this
  }

  eq(key: string, value: unknown) {
    this.filters.push((row) => row[key] === value)
    return this
  }

  lte(key: string, value: unknown) {
    this.filters.push((row) => String(row[key] ?? '') <= String(value))
    return this
  }

  is(key: string, value: unknown) {
    this.filters.push((row) => row[key] === value)
    return this
  }

  order() {
    return this
  }

  limit(value: number) {
    this.limitCount = value
    return this
  }

  then<TResult1 = { data: Record<string, unknown>[] | null; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Record<string, unknown>[] | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    try {
      const rows = this.findRows()
      if (this.updatePayload) {
        for (const row of rows) {
          Object.assign(row, this.updatePayload)
        }
      }
      const data = this.updatePayload ? null : rows.slice(0, this.limitCount ?? rows.length)
      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected)
    }
  }

  private findRows() {
    return this.tables[this.table].filter((row) =>
      this.filters.every((filter) => filter(row)),
    )
  }
}

function createMemorySupabase(tables: MemoryTables) {
  return {
    from(table: TableName) {
      return new MemoryQuery(tables, table)
    },
  }
}

async function main() {
  const now = new Date('2026-07-31T12:00:00.000Z')
  const channelId = 'a1000000-0000-4000-8000-000000000001'
  const tables: MemoryTables = {
    clips: [
      {
        id: 'expired-r2-ready',
        channel_id: channelId,
        publish_status: 'metricool_published',
        asset_storage_provider: 'r2',
        asset_storage_key: `channels/${channelId}/platform-packages/women/expired-r2-ready.mp4`,
        asset_public_url: `https://cdn.example.test/channels/${channelId}/platform-packages/women/expired-r2-ready.mp4`,
        asset_expires_at: '2026-07-30T12:00:00.000Z',
        asset_deleted_at: null,
        asset_delete_status: 'pending',
        asset_delete_error: null,
      },
      {
        id: 'expired-r2-scheduled',
        channel_id: channelId,
        publish_status: 'metricool_scheduled',
        asset_storage_provider: 'r2',
        asset_storage_key: `channels/${channelId}/platform-packages/women/expired-r2-scheduled.mp4`,
        asset_public_url: 'https://cdn.example.test/platform-packages/women/expired-r2-scheduled.mp4',
        asset_expires_at: '2026-07-30T12:00:00.000Z',
        asset_deleted_at: null,
        asset_delete_status: 'pending',
        asset_delete_error: null,
      },
      {
        id: 'expired-local-dev',
        channel_id: channelId,
        publish_status: 'ready_for_manual_publish',
        asset_storage_provider: 'local_dev',
        asset_storage_key: `channels/${channelId}/platform-packages/women/local-dev.mp4`,
        asset_public_url: '/generated-clips/platform-packages/women/local-dev.mp4',
        asset_expires_at: '2026-07-30T12:00:00.000Z',
        asset_deleted_at: null,
        asset_delete_status: 'pending',
        asset_delete_error: null,
      },
      {
        id: 'future-r2',
        channel_id: channelId,
        publish_status: 'metricool_published',
        asset_storage_provider: 'r2',
        asset_storage_key: `channels/${channelId}/platform-packages/women/future-r2.mp4`,
        asset_public_url: 'https://cdn.example.test/platform-packages/women/future-r2.mp4',
        asset_expires_at: '2026-08-01T12:00:00.000Z',
        asset_deleted_at: null,
        asset_delete_status: 'pending',
        asset_delete_error: null,
      },
      {
        id: 'expired-r2-legacy-unscoped',
        channel_id: channelId,
        publish_status: 'metricool_published',
        asset_storage_provider: 'r2',
        asset_storage_key: 'platform-packages/women/legacy.mp4',
        asset_public_url: 'https://cdn.example.test/platform-packages/women/legacy.mp4',
        asset_expires_at: '2026-07-30T12:00:00.000Z',
        asset_deleted_at: null,
        asset_delete_status: 'pending',
        asset_delete_error: null,
      },
    ],
    mac_mini_clip_packages: [
      {
        id: 'pkg-expired-r2-ready',
        target_channel_id: channelId,
        asset_storage_key: `channels/${channelId}/platform-packages/women/expired-r2-ready.mp4`,
        asset_delete_status: 'pending',
        asset_deleted_at: null,
      },
    ],
  }
  const deletedKeys: string[] = []

  const result = await cleanupExpiredAssets(createMemorySupabase(tables) as never, {
    now,
    deleteObject: async (storageKey, ownerChannelId) => {
      assert.equal(ownerChannelId, channelId)
      deletedKeys.push(storageKey)
    },
  })

  const deletedClip = tables.clips.find((row) => row.id === 'expired-r2-ready')
  const scheduledClip = tables.clips.find((row) => row.id === 'expired-r2-scheduled')
  const localClip = tables.clips.find((row) => row.id === 'expired-local-dev')
  const futureClip = tables.clips.find((row) => row.id === 'future-r2')
  const legacyClip = tables.clips.find((row) => row.id === 'expired-r2-legacy-unscoped')
  const packageRow = tables.mac_mini_clip_packages[0]

  assert.equal(result.scanned, 4)
  assert.equal(result.deleted, 1)
  assert.equal(result.skipped, 3)
  assert.equal(result.failed, 0)
  assert.deepEqual(deletedKeys, [`channels/${channelId}/platform-packages/women/expired-r2-ready.mp4`])
  assert.equal(deletedClip?.asset_delete_status, 'deleted')
  assert.equal(packageRow.asset_delete_status, 'deleted')
  assert.equal(scheduledClip?.asset_delete_status, 'skipped_pending_publish')
  assert.equal(localClip?.asset_delete_status, 'skipped_local_dev')
  assert.equal(futureClip?.asset_delete_status, 'pending')
  assert.equal(legacyClip?.asset_delete_status, 'skipped_legacy_unscoped')

  console.log(JSON.stringify({
    result: 'PASS',
    cleanup: result,
    deletedKeys,
    safety: {
      fixtureOnly: true,
      callsMetricool: false,
      posts: false,
      schedules: false,
      uploadsToTikTok: false,
      uploadsToInstagram: false,
      uploadsToYouTube: false,
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({
    result: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
