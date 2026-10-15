import { ChannelAccessError } from './channel-access'
import { assertChannelId, assertChannelQueueScope } from './channel-scope'

export type ChannelEntityType =
  | 'source'
  | 'source_suggestion'
  | 'source_channel'
  | 'source_item'
  | 'moderation_clip'
  | 'rbhq_clip'
  | 'post'
  | 'clip_candidate'
  | 'mac_mini_package'
  | 'ingested_video'
  | 'video_transcript'
  | 'reply_session'
  | 'reply_feedback'
  | 'publish_job'
  | 'publish_event'
  | 'analytics_snapshot'
  | 'rbhq_clip_score'
  | 'workflow_event'
  | 'war_room_audit_log'

export type SourceChannelResolution = {
  id: string
  channelId: string | null
}

export type ChannelOwnershipRepository = {
  channelExists(channelId: string): Promise<boolean>
  findEntityChannelId(type: ChannelEntityType, id: string): Promise<string | null>
  findSourceChannelIds(sourceIds: string[]): Promise<SourceChannelResolution[]>
}

export type ChannelOwnershipGuard = {
  assertChannel(channelId: string): Promise<string>
  assertEntity(channelId: string, type: ChannelEntityType, id: string): Promise<string>
  assertSources(
    channelId: string,
    sourceIds: string[],
    options?: { requireSources?: boolean },
  ): Promise<string[]>
}

type SupabaseLike = {
  from(table: string): any
}

const DIRECT_ENTITY = {
  source: ['sources', 'channel_id'],
  source_suggestion: ['source_suggestions', 'channel_id'],
  source_channel: ['source_channels', 'target_rbhq_channel_id'],
  source_item: ['rbhq_source_items', 'channel_id'],
  moderation_clip: ['clips', 'channel_id'],
  rbhq_clip: ['rbhq_clips', 'channel_id'],
  post: ['posts', 'channel_id'],
  mac_mini_package: ['mac_mini_clip_packages', 'target_channel_id'],
} satisfies Partial<Record<ChannelEntityType, readonly [string, string]>>

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

function entityNotFound(type: ChannelEntityType): ChannelAccessError {
  return new ChannelAccessError('ENTITY_NOT_FOUND', `${type} was not found or has no channel owner.`, 404)
}

export function createChannelOwnershipGuard(
  repository: ChannelOwnershipRepository,
): ChannelOwnershipGuard {
  const assertChannel = async (channelId: string): Promise<string> => {
    const normalized = assertChannelId(channelId)
    if (!(await repository.channelExists(normalized))) {
      throw new ChannelAccessError('CHANNEL_NOT_FOUND', 'Channel not found.', 404)
    }
    return normalized
  }

  const assertEntity = async (
    channelId: string,
    type: ChannelEntityType,
    id: string,
  ): Promise<string> => {
    const expectedChannelId = await assertChannel(channelId)
    const normalizedId = id.trim()
    if (!normalizedId) throw entityNotFound(type)

    const actualChannelId = await repository.findEntityChannelId(type, normalizedId)
    if (!actualChannelId) throw entityNotFound(type)

    try {
      assertChannelQueueScope(expectedChannelId, actualChannelId)
    } catch (error) {
      if (error instanceof ChannelAccessError) {
        throw new ChannelAccessError(
          'CROSS_CHANNEL_ENTITY_ACCESS',
          `${type} does not belong to the authorized channel.`,
        )
      }
      throw error
    }
    return normalizedId
  }

  const assertSources = async (
    channelId: string,
    sourceIds: string[],
    options: { requireSources?: boolean } = {},
  ): Promise<string[]> => {
    const expectedChannelId = await assertChannel(channelId)
    const ids = uniqueIds(sourceIds)
    if (options.requireSources && ids.length === 0) {
      throw new ChannelAccessError(
        'QUEUE_SOURCES_REQUIRED',
        'This queue operation requires at least one channel-owned source.',
        400,
      )
    }
    if (ids.length === 0) return []

    const resolutions = await repository.findSourceChannelIds(ids)
    const channelById = new Map(resolutions.map((row) => [row.id, row.channelId]))
    for (const id of ids) {
      const actualChannelId = channelById.get(id)
      if (!actualChannelId) throw entityNotFound('source')
      try {
        assertChannelQueueScope(expectedChannelId, actualChannelId)
      } catch (error) {
        if (error instanceof ChannelAccessError) {
          throw new ChannelAccessError(
            'CROSS_CHANNEL_ENTITY_ACCESS',
            'One or more sources do not belong to the authorized channel.',
          )
        }
        throw error
      }
    }
    return ids
  }

  return {
    assertChannel,
    assertEntity,
    assertSources,
  }
}

async function selectSingle(
  db: SupabaseLike,
  table: string,
  select: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from(table).select(select).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Record<string, unknown> | null) ?? null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function createSupabaseChannelOwnershipRepository(
  db: SupabaseLike,
): ChannelOwnershipRepository {
  const findEntityChannelId = async (
    type: ChannelEntityType,
    id: string,
  ): Promise<string | null> => {
    const direct = DIRECT_ENTITY[type as keyof typeof DIRECT_ENTITY]
    if (direct) {
      const [table, channelColumn] = direct
      const row = await selectSingle(db, table, `id, ${channelColumn}`, id)
      return stringValue(row?.[channelColumn])
    }

    if (type === 'ingested_video') {
      const video = await selectSingle(db, 'ingested_videos', 'id, source_channel_id', id)
      const sourceId = stringValue(video?.source_channel_id)
      return sourceId ? findEntityChannelId('source_channel', sourceId) : null
    }
    if (type === 'clip_candidate') {
      const candidate = await selectSingle(
        db,
        'clip_candidates',
        'id, target_channel_id, ingested_video_id',
        id,
      )
      const targetChannelId = stringValue(candidate?.target_channel_id)
      if (targetChannelId) return targetChannelId
      const videoId = stringValue(candidate?.ingested_video_id)
      return videoId ? findEntityChannelId('ingested_video', videoId) : null
    }
    if (type === 'video_transcript') {
      const transcript = await selectSingle(db, 'video_transcripts', 'id, ingested_video_id', id)
      const videoId = stringValue(transcript?.ingested_video_id)
      return videoId ? findEntityChannelId('ingested_video', videoId) : null
    }
    if (type === 'reply_session') {
      const reply = await selectSingle(db, 'reply_sessions', 'id, post_id', id)
      const postId = stringValue(reply?.post_id)
      return postId ? findEntityChannelId('post', postId) : null
    }
    if (type === 'reply_feedback') {
      const feedback = await selectSingle(db, 'reply_feedback', 'id, reply_session_id', id)
      const replyId = stringValue(feedback?.reply_session_id)
      return replyId ? findEntityChannelId('reply_session', replyId) : null
    }
    if (type === 'publish_job') {
      const job = await selectSingle(db, 'publish_jobs', 'id, clip_id', id)
      const postId = stringValue(job?.clip_id)
      return postId ? findEntityChannelId('post', postId) : null
    }
    if (type === 'publish_event' || type === 'analytics_snapshot') {
      const table = type === 'publish_event' ? 'publish_events' : 'rbhq_analytics_snapshots'
      const event = await selectSingle(db, table, 'id, post_id', id)
      const postId = stringValue(event?.post_id)
      return postId ? findEntityChannelId('post', postId) : null
    }
    if (type === 'rbhq_clip_score') {
      const score = await selectSingle(db, 'rbhq_clip_scores', 'id, clip_id', id)
      const clipId = stringValue(score?.clip_id)
      return clipId ? findEntityChannelId('rbhq_clip', clipId) : null
    }
    if (type === 'workflow_event') {
      const event = await selectSingle(db, 'rbhq_workflow_events', 'id, entity_type, entity_id', id)
      const entityId = stringValue(event?.entity_id)
      if (!entityId) return null
      if (event?.entity_type === 'source_item') return findEntityChannelId('source_item', entityId)
      if (event?.entity_type === 'clip') return findEntityChannelId('rbhq_clip', entityId)
      if (event?.entity_type === 'post') return findEntityChannelId('post', entityId)
      return null
    }
    if (type === 'war_room_audit_log') {
      const audit = await selectSingle(db, 'war_room_audit_logs', 'id, post_id, clip_id', id)
      const postId = stringValue(audit?.post_id) ?? stringValue(audit?.clip_id)
      return postId ? findEntityChannelId('post', postId) : null
    }

    return null
  }

  return {
    async channelExists(channelId) {
      const row = await selectSingle(db, 'channels', 'id', channelId)
      return Boolean(row?.id)
    },
    findEntityChannelId,
    async findSourceChannelIds(sourceIds) {
      const ids = uniqueIds(sourceIds)
      if (ids.length === 0) return []
      const { data, error } = await db
        .from('sources')
        .select('id, channel_id')
        .in('id', ids)
      if (error) throw new Error(error.message)
      return (data ?? []).map((row: { id: string; channel_id: string | null }) => ({
        id: row.id,
        channelId: row.channel_id,
      }))
    },
  }
}

export function createSupabaseChannelOwnershipGuard(db: SupabaseLike): ChannelOwnershipGuard {
  return createChannelOwnershipGuard(createSupabaseChannelOwnershipRepository(db))
}
