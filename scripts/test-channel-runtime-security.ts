import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { resolveConfiguredSessionAccess } from '../lib/app-users'
import {
  createChannelOwnershipGuard,
  createSupabaseChannelOwnershipGuard,
  type ChannelEntityType,
  type ChannelOwnershipRepository,
} from '../lib/channel-ownership'
import { ChannelAccessError } from '../lib/channel-access'
import { deleteStoredPlatformMp4Asset } from '../lib/media-storage'
import {
  validateApifyPollJobOwnership,
  validateClipGenerationJobOwnership,
  validateIngestJobOwnership,
} from '../lib/channel-job-ownership'

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

class MemoryOwnershipQuery {
  private readonly filters: Array<{ key: string; value: unknown }> = []

  constructor(private readonly rows: Array<Record<string, unknown>>) {}

  select() {
    return this
  }

  eq(keyName: string, value: unknown) {
    this.filters.push({ key: keyName, value })
    return this
  }

  async maybeSingle() {
    const data = this.rows.find((row) =>
      this.filters.every((filter) => row[filter.key] === filter.value),
    ) ?? null
    return { data, error: null }
  }
}

function createIndirectOwnershipDb() {
  const rows: Record<string, Array<Record<string, unknown>>> = {
    channels: [{ id: CHANNEL_A }, { id: CHANNEL_B }],
    posts: [
      { id: 'post-a', channel_id: CHANNEL_A },
      { id: 'post-b', channel_id: CHANNEL_B },
    ],
    reply_sessions: [
      { id: REPLY_A, post_id: 'post-a' },
      { id: REPLY_B, post_id: 'post-b' },
    ],
    reply_feedback: [
      { id: 'feedback-a', reply_session_id: REPLY_A },
      { id: 'feedback-b', reply_session_id: REPLY_B },
    ],
  }
  return {
    from(table: string) {
      assert.ok(rows[table], `Unexpected ownership table: ${table}`)
      return new MemoryOwnershipQuery(rows[table])
    },
  }
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
  const indirectGuard = createSupabaseChannelOwnershipGuard(createIndirectOwnershipDb())
  await indirectGuard.assertEntity(CHANNEL_A, 'reply_feedback', 'feedback-a')
  await assert.rejects(
    indirectGuard.assertEntity(CHANNEL_A, 'reply_feedback', 'feedback-b'),
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

  await assert.rejects(
    deleteStoredPlatformMp4Asset({
      channelId: CHANNEL_A,
      objectKey: `channels/${CHANNEL_B}/platform-packages/test/clip.mp4`,
      storageMode: 'r2',
    }),
    (error) => assertChannelError(error, 'CROSS_CHANNEL_STORAGE_ACCESS'),
  )
  await assert.rejects(
    deleteStoredPlatformMp4Asset({
      channelId: CHANNEL_A,
      objectKey: 'platform-packages/legacy/clip.mp4',
      storageMode: 'r2',
    }),
    (error) => assertChannelError(error, 'CROSS_CHANNEL_STORAGE_ACCESS'),
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
    '202610160001_source_suggestions_store.sql',
  ]
  const migrations = migrationFiles.map((filename) =>
    readFileSync(path.join(root, 'supabase/migrations', filename), 'utf8'),
  )
  for (const [index, migration] of migrations.entries()) {
    assert.match(migration, /^begin;/im, `${migrationFiles[index]} must be transactional`)
    assert.match(migration, /commit;\s*$/im, `${migrationFiles[index]} must commit explicitly`)
  }

  const rls = migrations[2]
  assert.match(rls, /as restrictive/i, 'RBHQ isolation policies must constrain unrelated permissive policies')
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
    /publish_logs[\s\S]*posts/i,
    /rbhq_posts[\s\S]*rbhq_clips/i,
    /rbhq_posted_clips[\s\S]*rbhq_clips/i,
  ]) {
    assert.match(rls, relation, `RLS migration is missing an indirect ownership policy: ${relation}`)
  }
  for (const directRelation of ['comments', 'channel_sources', 'channel_programming']) {
    assert.match(
      rls,
      new RegExp(`rbhq_install_direct_policy\\('${directRelation}', 'channel_id'\\)`),
      `${directRelation} must be directly channel scoped`,
    )
  }
  const sourceSuggestions = migrations[3]
  assert.match(sourceSuggestions, /create table if not exists public\.source_suggestions/i)
  assert.match(sourceSuggestions, /channel_id uuid not null references public\.channels/i)
  assert.match(sourceSuggestions, /operator_id uuid not null references public\.users/i)
  assert.match(sourceSuggestions, /alter table public\.source_suggestions force row level security/i)
  assert.match(
    sourceSuggestions,
    /create policy rbhq_channel_isolation[\s\S]*private\.rbhq_can_access_channel\(channel_id\)/i,
  )
  assert.doesNotMatch(
    migrations.join('\n'),
    /alter\s+publication\s+supabase_realtime\s+add\s+table/i,
    'Phase 1 must not enable Postgres Changes replication',
  )
  assert.match(migrations[0], /alter table public\.rbhq_clips[\s\S]*add column if not exists channel_id/i)
  assert.match(migrations[1], /RBHQ_OPERATOR_ASSIGNMENT_REQUIRED/i)
  const assignmentMigration = migrations[1]
  assert.match(assignmentMigration, /\$owner_confirmed_thomas_assignment\$/i)
  assert.match(assignmentMigration, /d661928a-95a7-40e6-862d-fb18e78bf583/i)
  assert.match(assignmentMigration, /93484eef-06d8-46fd-bce2-ce252422c58e/i)
  assert.match(assignmentMigration, /lower\(coalesce\(role::text, ''\)\) = 'operator'/i)
  assert.match(assignmentMigration, /RBHQ_OWNER_CONFIRMED_ASSIGNMENT_INVALID/i)
  assert.ok(
    assignmentMigration.indexOf('$owner_confirmed_thomas_assignment$') <
      assignmentMigration.indexOf('select legacy.user_id, min(legacy.channel_id::text)::uuid'),
    'owner-confirmed Thomas assignment must be installed before the legacy backfill',
  )
  const ownerAssignmentBlock = assignmentMigration.match(
    /do \$owner_confirmed_thomas_assignment\$[\s\S]*?\$owner_confirmed_thomas_assignment\$;/i,
  )?.[0]
  assert.ok(ownerAssignmentBlock, 'owner-confirmed Thomas assignment block is required')
  assert.doesNotMatch(ownerAssignmentBlock, /update\s+public\.users/i)
  assert.doesNotMatch(ownerAssignmentBlock, /update\s+public\.user_settings/i)

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

  const ingestRoute = readFileSync(path.join(root, 'app/api/ingest/run/route.ts'), 'utf8')
  assert.ok(
    ingestRoute.indexOf('ownershipGuard.assertSources') < ingestRoute.indexOf('jobId: await enqueueIngestJob'),
    'ingest API ownership must be resolved before queue side effects',
  )
  const decisionRoute = readFileSync(path.join(root, 'app/api/posts/[postId]/decision/route.ts'), 'utf8')
  assert.ok(
    decisionRoute.indexOf("await ownershipGuard.assertEntity(clip.channel_id, 'clip_candidate'") <
      decisionRoute.indexOf('const refreshed = await refreshClipPrepForCandidate'),
    'candidate ownership must be resolved before clip-prep or package side effects',
  )

  console.log('PASS executable poisoned-job, indirect ownership, migration, auth, and side-effect ordering security tests')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
