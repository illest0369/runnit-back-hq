import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { resolveConfiguredSessionAccess } from '../lib/app-users'
import {
  createChannelOwnershipGuard,
  type ChannelEntityType,
  type ChannelOwnershipRepository,
} from '../lib/channel-ownership'
import { ChannelAccessError } from '../lib/channel-access'
import {
  validateApifyPollJobOwnership,
  validateClipGenerationJobOwnership,
  validateIngestJobOwnership,
} from '../workers/job-ownership'

const CHANNEL_A = 'a1000000-0000-4000-8000-000000000001'
const CHANNEL_B = 'a1000000-0000-4000-8000-000000000002'
const SOURCE_A = 'b1000000-0000-4000-8000-000000000001'
const SOURCE_B = 'b1000000-0000-4000-8000-000000000002'
const CANDIDATE_A = 'c1000000-0000-4000-8000-000000000001'
const CANDIDATE_B = 'c1000000-0000-4000-8000-000000000002'
const REPLY_A = 'd1000000-0000-4000-8000-000000000001'
const REPLY_B = 'd1000000-0000-4000-8000-000000000002'

function key(type: ChannelEntityType, id: string) {
  return `${type}:${id}`
}

const entityChannels = new Map<string, string>([
  [key('clip_candidate', CANDIDATE_A), CHANNEL_A],
  [key('clip_candidate', CANDIDATE_B), CHANNEL_B],
  [key('reply_session', REPLY_A), CHANNEL_A],
  [key('reply_session', REPLY_B), CHANNEL_B],
  [key('moderation_clip', CANDIDATE_A), CHANNEL_A],
  [key('source_suggestion', SOURCE_A), CHANNEL_A],
])

const repository: ChannelOwnershipRepository = {
  async channelExists(channelId) {
    return channelId === CHANNEL_A || channelId === CHANNEL_B
  },
  async findEntityChannelId(type, id) {
    return entityChannels.get(key(type, id)) ?? null
  },
  async findSourceChannelIds(sourceIds) {
    return sourceIds.map((sourceId) => {
      if (sourceId === SOURCE_A) return { id: SOURCE_A, channelId: CHANNEL_A }
      if (sourceId === SOURCE_B) return { id: SOURCE_B, channelId: CHANNEL_B }
      return { id: sourceId, channelId: null }
    })
  },
}

function assertChannelError(error: unknown, code: string) {
  assert(error instanceof ChannelAccessError)
  assert.equal(error.code, code)
  return true
}

async function main() {
  const guard = createChannelOwnershipGuard(repository)

  await guard.assertChannel(CHANNEL_A)
  await assert.rejects(
    guard.assertChannel('a1000000-0000-4000-8000-000000000099'),
    (error) => assertChannelError(error, 'CHANNEL_NOT_FOUND'),
  )

  await guard.assertSources(CHANNEL_A, [SOURCE_A], { requireSources: true })
  await assert.rejects(
    guard.assertSources(CHANNEL_A, [], { requireSources: true }),
    (error) => assertChannelError(error, 'QUEUE_SOURCES_REQUIRED'),
  )
  await assert.rejects(
    guard.assertSources(CHANNEL_A, [SOURCE_A, SOURCE_B], { requireSources: true }),
    (error) => assertChannelError(error, 'CROSS_CHANNEL_ENTITY_ACCESS'),
  )

  await guard.assertEntity(CHANNEL_A, 'clip_candidate', CANDIDATE_A)
  await assert.rejects(
    guard.assertEntity(CHANNEL_A, 'clip_candidate', CANDIDATE_B),
    (error) => assertChannelError(error, 'CROSS_CHANNEL_ENTITY_ACCESS'),
  )
  await guard.assertEntity(CHANNEL_A, 'reply_session', REPLY_A)
  await assert.rejects(
    guard.assertEntity(CHANNEL_A, 'reply_session', REPLY_B),
    (error) => assertChannelError(error, 'CROSS_CHANNEL_ENTITY_ACCESS'),
  )

  await validateIngestJobOwnership(guard, {
    channelId: CHANNEL_A,
    mode: 'native',
    sourceIds: [SOURCE_A],
  })
  await assert.rejects(
    validateIngestJobOwnership(guard, {
      channelId: CHANNEL_A,
      mode: 'native',
      sourceIds: [SOURCE_B],
    }),
    (error) => assertChannelError(error, 'CROSS_CHANNEL_ENTITY_ACCESS'),
  )
  await assert.rejects(
    validateIngestJobOwnership(guard, {
      channelId: CHANNEL_A,
      mode: 'apify',
      sourceIds: [],
    }),
    (error) => assertChannelError(error, 'QUEUE_SOURCES_REQUIRED'),
  )
  await validateIngestJobOwnership(guard, {
    channelId: CHANNEL_A,
    mode: 'discovery',
    sourceIds: [],
  })

  await assert.rejects(
    validateApifyPollJobOwnership(guard, {
      channelId: CHANNEL_A,
      mode: 'apify',
      sourceIds: [SOURCE_B],
    }),
    (error) => assertChannelError(error, 'CROSS_CHANNEL_ENTITY_ACCESS'),
  )

  await validateClipGenerationJobOwnership(guard, {
    channelId: CHANNEL_A,
    sourceSuggestionId: SOURCE_A,
    moderationClipId: CANDIDATE_A,
  })
  await assert.rejects(
    validateClipGenerationJobOwnership(guard, {
      channelId: CHANNEL_B,
      sourceSuggestionId: SOURCE_A,
      moderationClipId: null,
    }),
    (error) => assertChannelError(error, 'CROSS_CHANNEL_ENTITY_ACCESS'),
  )

  const previousUsers = process.env.APP_USERS_JSON
  process.env.APP_USERS_JSON = JSON.stringify([
    {
      id: 'env:operator-a',
      username: 'operator-a',
      role: 'operator',
      channelIds: [CHANNEL_A],
      pinHash: 'not-used-by-session-resolution',
    },
  ])
  try {
    assert.equal(
      resolveConfiguredSessionAccess('env:operator-a', 'operator-a'),
      null,
      'configuration-backed operator authorization must be disabled',
    )
  } finally {
    if (previousUsers === undefined) delete process.env.APP_USERS_JSON
    else process.env.APP_USERS_JSON = previousUsers
  }

  const root = process.cwd()
  const migrationFiles = [
    '202610140001_channel_isolation_schema.sql',
    '202610140002_channel_assignment_backfill.sql',
    '202610140003_channel_isolation_rls.sql',
  ]
  const migrations = migrationFiles.map((filename) =>
    readFileSync(path.join(root, 'supabase/migrations', filename), 'utf8'),
  )
  for (const [index, migration] of migrations.entries()) {
    assert.match(migration, /^begin;/im, `${migrationFiles[index]} must be transactional`)
    assert.match(migration, /commit;\s*$/im, `${migrationFiles[index]} must commit explicitly`)
  }

  const rls = migrations[2]
  assert.doesNotMatch(
    rls,
    /select policyname[\s\S]*drop policy %i/i,
    'RLS migration must not enumerate and drop unrelated policies',
  )
  assert.doesNotMatch(
    rls,
    /drop policy(?! if exists rbhq_)/i,
    'RLS migration may replace only explicitly named RBHQ policies',
  )
  for (const relation of [
    /reply_sessions[\s\S]*posts/i,
    /reply_feedback[\s\S]*reply_sessions[\s\S]*posts/i,
    /rbhq_clip_scores[\s\S]*rbhq_clips/i,
    /publish_jobs[\s\S]*posts/i,
    /publish_events[\s\S]*posts/i,
    /rbhq_analytics_snapshots[\s\S]*posts/i,
  ]) {
    assert.match(rls, relation, `RLS migration is missing an indirect ownership policy: ${relation}`)
  }

  const workerSource = readFileSync(path.join(root, 'workers/rbhqWorker.ts'), 'utf8')
  assert.ok(
    workerSource.indexOf('validateApifyPollJobOwnership') < workerSource.indexOf('getApifyRun('),
    'Apify poll ownership must be validated before the first external call',
  )
  const clipService = readFileSync(path.join(root, 'services/clipService.ts'), 'utf8')
  assert.ok(
    clipService.indexOf('validateClipGenerationJobOwnership') < clipService.indexOf('ensureClipDirectories('),
    'clip ownership must be validated before filesystem or media side effects',
  )
  assert.match(clipService, /buildChannelStorageKey/)
  assert.doesNotMatch(clipService, /storagePath = `\$\{input\.channelId\}\//)

  console.log('PASS executable poisoned-job, indirect ownership, migration, auth, and side-effect ordering security tests')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
