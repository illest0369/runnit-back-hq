import type { ChannelOwnershipGuard } from './channel-ownership'

type SourceJob = {
  channelId: string
  mode?: 'native' | 'curated' | 'discovery' | 'apify'
  sourceIds?: string[]
}

export async function validateIngestJobOwnership(
  guard: ChannelOwnershipGuard,
  job: SourceJob,
): Promise<void> {
  const requiresSources = job.mode !== 'discovery'
  await guard.assertSources(job.channelId, job.sourceIds ?? [], {
    requireSources: requiresSources,
  })
}

export async function validateApifyPollJobOwnership(
  guard: ChannelOwnershipGuard,
  job: SourceJob,
): Promise<void> {
  const requiresSources = job.mode !== 'discovery'
  await guard.assertSources(job.channelId, job.sourceIds ?? [], {
    requireSources: requiresSources,
  })
}

export async function validateClipGenerationJobOwnership(
  guard: ChannelOwnershipGuard,
  job: {
    channelId: string
    sourceSuggestionId?: string | null
    moderationClipId?: string | null
  },
): Promise<void> {
  await guard.assertChannel(job.channelId)
  if (job.sourceSuggestionId) {
    await guard.assertEntity(job.channelId, 'source_suggestion', job.sourceSuggestionId)
  }
  if (job.moderationClipId) {
    await guard.assertEntity(job.channelId, 'moderation_clip', job.moderationClipId)
  }
}
