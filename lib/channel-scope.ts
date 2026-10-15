import { ChannelAccessError } from './channel-access'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAFE_SEGMENT_PATTERN = /^[a-zA-Z0-9._-]+$/

export function assertChannelId(channelId: string): string {
  const normalized = channelId.trim().toLowerCase()
  if (!UUID_PATTERN.test(normalized)) {
    throw new ChannelAccessError('INVALID_CHANNEL_SCOPE', 'A valid channel scope is required.', 400)
  }

  return normalized
}

function assertPathSegment(segment: string): string {
  const normalized = segment.trim()
  if (!normalized || !SAFE_SEGMENT_PATTERN.test(normalized) || normalized === '.' || normalized === '..') {
    throw new ChannelAccessError('INVALID_STORAGE_KEY', 'Storage keys contain an invalid path segment.', 400)
  }

  return normalized
}

export function buildChannelStorageKey(input: {
  channelId: string
  category: string
  segments: string[]
}): string {
  const channelId = assertChannelId(input.channelId)
  const parts = [
    'channels',
    channelId,
    assertPathSegment(input.category),
    ...input.segments.map(assertPathSegment),
  ]

  return parts.join('/')
}

export function assertChannelStorageKey(expectedChannelId: string, objectKey: string): void {
  const expected = assertChannelId(expectedChannelId)
  const parts = objectKey.split('/')
  if (parts[0] !== 'channels') {
    throw new ChannelAccessError(
      'CROSS_CHANNEL_STORAGE_ACCESS',
      'Storage object does not belong to the authorized channel.',
    )
  }
  if (parts.length < 4 || parts.some((part) => !part.trim())) {
    throw new ChannelAccessError('INVALID_STORAGE_KEY', 'Storage key structure is invalid.', 400)
  }

  const actualChannelId = assertChannelId(parts[1])
  parts.slice(2).forEach(assertPathSegment)
  if (actualChannelId !== expected) {
    throw new ChannelAccessError(
      'CROSS_CHANNEL_STORAGE_ACCESS',
      'Storage object does not belong to the authorized channel.',
    )
  }
}

export function assertChannelQueueScope(expectedChannelId: string, actualChannelId: string): void {
  if (assertChannelId(expectedChannelId) !== assertChannelId(actualChannelId)) {
    throw new ChannelAccessError(
      'CROSS_CHANNEL_QUEUE_ACCESS',
      'Queue payload does not belong to the authorized channel.',
    )
  }
}
