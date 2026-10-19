import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migrationPaths = [
  'supabase/migrations/202607310001_asset_retention.sql',
  'supabase/migrations/202610140001_channel_isolation_schema.sql',
  'supabase/migrations/202610140002_channel_assignment_backfill.sql',
  'supabase/migrations/202610140003_channel_isolation_rls.sql',
  'supabase/migrations/20261019025640_revoke_anon_public_access.sql',
]
const migrations = migrationPaths.map((migrationPath) =>
  readFileSync(path.join(root, migrationPath), 'utf8'),
)
const migration = migrations.join('\n')

const requiredSql = [
  /create table if not exists public\.operator_channel_assignments/i,
  /user_id uuid primary key/i,
  /channel_id uuid not null/i,
  /create or replace function private\.rbhq_is_super_admin/i,
  /create or replace function private\.rbhq_current_channel_id/i,
  /create or replace function private\.rbhq_can_access_channel/i,
  /alter table public\.channels enable row level security/i,
  /alter table public\.operator_channel_assignments enable row level security/i,
  /rbhq_install_direct_policy\('clips', 'channel_id'\)/i,
  /rbhq_install_direct_policy\('comments', 'channel_id'\)/i,
  /rbhq_install_direct_policy\('channel_sources', 'channel_id'\)/i,
  /rbhq_install_direct_policy\('channel_programming', 'channel_id'\)/i,
  /rbhq_install_direct_policy\('source_channels', 'target_rbhq_channel_id'\)/i,
  /alter table public\.ingested_videos enable row level security/i,
  /alter table public\.video_transcripts enable row level security/i,
  /rbhq_install_direct_policy\('clip_candidates', 'target_channel_id'\)/i,
  /rbhq_install_direct_policy\('mac_mini_clip_packages', 'target_channel_id'\)/i,
  /having count\(distinct legacy\.channel_id\) = 1/i,
  /RBHQ_OPERATOR_ASSIGNMENT_REQUIRED/i,
  /add column if not exists channel_id uuid references public\.channels/i,
  /clip_sources_channel_name_type_key/i,
  /rbhq_install_post_child_policy\('publish_logs', 'post_id'\)/i,
  /rbhq_install_rbhq_clip_child_policy\('rbhq_posts', 'clip_id'\)/i,
  /rbhq_install_rbhq_clip_child_policy\('rbhq_posted_clips', 'clip_id'\)/i,
  /rbhq_legacy_assignments_select_scope/i,
  /rbhq_install_admin_only_policy\('learning_weights'\)/i,
  /force row level security/i,
  /execute format\('revoke all on public\.%I from anon', target_table_name\)/i,
  /revoke all on public\.reply_feedback from anon/i,
  /as restrictive/i,
  /create policy rbhq_authenticated_gate/i,
  /rbhq_channel_isolation/i,
  /rbhq_super_admin_only/i,
  /grant select, insert, update, delete on public\.operator_channel_assignments to authenticated, service_role/i,
  /create policy rbhq_assignments_insert_scope/i,
  /with check \(\(select private\.rbhq_is_super_admin\(\)\)\)/i,
  /rbhq_can_access_channel/i,
]

for (const pattern of requiredSql) {
  assert.match(migration, pattern, `migration is missing security control ${pattern}`)
}

for (const [index, sql] of migrations.entries()) {
  assert.match(sql, /^begin;/im, `${migrationPaths[index]} must begin a transaction`)
  assert.match(sql, /commit;\s*$/im, `${migrationPaths[index]} must commit its transaction`)
}

const anonAccessMigration = migrations[4]
assert.match(anonAccessMigration, /revoke usage on schema public from anon/i)
assert.match(
  anonAccessMigration,
  /revoke all privileges on all tables in schema public from anon/i,
)
assert.match(
  anonAccessMigration,
  /revoke execute on all functions in schema public from public, anon/i,
)
assert.match(
  anonAccessMigration,
  /alter default privileges for role postgres in schema public[\s\S]*revoke all privileges on tables from anon/i,
)
assert.doesNotMatch(
  anonAccessMigration,
  /revoke\s+(?:all privileges|select|insert|update|delete|execute|usage)[\s\S]*?from\s+(?:authenticated|service_role)/i,
  'anonymous containment must not revoke authenticated or service-role access',
)

const anonAccessRollback = readFileSync(
  path.join(root, 'supabase/rollback/20261019025640_revoke_anon_public_access.sql'),
  'utf8',
)
assert.match(anonAccessRollback, /^begin;/im)
assert.match(anonAccessRollback, /grant usage on schema public to anon/i)
assert.match(
  anonAccessRollback,
  /grant all privileges on all tables in schema public to anon/i,
)
assert.match(
  anonAccessRollback,
  /grant execute on all functions in schema public to public, anon/i,
)
assert.match(anonAccessRollback, /commit;\s*$/im)

assert.doesNotMatch(
  migration,
  /to authenticated\s+using\s*\(\s*true\s*\)/i,
  'authenticated users must never receive an allow-all tenant policy',
)

const authSource = readFileSync(path.join(root, 'lib/auth.ts'), 'utf8')
assert.match(authSource, /resolveServerSession/)

const serverSession = readFileSync(path.join(root, 'lib/server-channel-session.ts'), 'utf8')
assert.match(serverSession, /operator_channel_assignments/)
assert.doesNotMatch(serverSession, /user_channel_access|user_channels/)

const serverDataAccess = readFileSync(path.join(root, 'lib/runnitback-server.ts'), 'utf8')
assert.doesNotMatch(serverDataAccess, /getLegacyChannelAccess|user_channel_access|user_channels/)

const ingestRoute = readFileSync(path.join(root, 'app/api/ingest/run/route.ts'), 'utf8')
assert.match(ingestRoute, /getSessionFromRequest/)
assert.match(ingestRoute, /enqueueRbhqIngestJob/)
assert.doesNotMatch(ingestRoute, /decodeSessionPayload|createHmac/)
assert.doesNotMatch(ingestRoute, /enqueue-rbhq-ingest-job\.mjs|execFile/)

const setPinRoute = readFileSync(path.join(root, 'app/api/set-pin/route.ts'), 'utf8')
assert.match(setPinRoute, /getSessionFromRequest/)
assert.match(setPinRoute, /validateCsrfRequest/)
assert.match(setPinRoute, /session\.role !== 'admin'/)
assert.doesNotMatch(setPinRoute, /createSession/)

const operatorApp = readFileSync(path.join(root, 'components/rbhq/OperatorApp.tsx'), 'utf8')
assert.match(operatorApp, /const canSwitchChannels = user\.role === "admin"/)
assert.match(operatorApp, /canSwitchChannels && channels\.length > 1/)

const mediaStorage = readFileSync(path.join(root, 'lib/media-storage.ts'), 'utf8')
assert.match(mediaStorage, /buildChannelStorageKey/)
assert.match(mediaStorage, /channelId: string/)

const queue = readFileSync(path.join(root, 'lib/queue.ts'), 'utf8')
for (const queueType of [
  'RbhqIngestJobData',
  'RbhqApifyPollJobData',
  'RbhqScoreJobData',
  'RbhqPostJobData',
  'RbhqAnalyticsJobData',
]) {
  assert.match(
    queue,
    new RegExp(`type ${queueType} = \\{[\\s\\S]*?channelId: string`),
    `${queueType} must carry a required channel scope`,
  )
}

const worker = readFileSync(path.join(root, 'workers/rbhqWorker.ts'), 'utf8')
assert.match(worker, /validateIngestJobOwnership/)
assert.match(worker, /validateApifyPollJobOwnership/)
assert.match(worker, /ownershipGuard\.assertEntity/)
assert.match(worker, /\.eq\('channel_id', job\.data\.channelId\)/)

const nativeIngest = readFileSync(path.join(root, 'lib/rbhq-native-ingest.ts'), 'utf8')
assert.match(
  nativeIngest,
  /function toSourceItem[\s\S]*channel_id: video\.source\.channel_id/,
  'native source-item writes must persist their channel owner',
)

const clipWorkerDb = readFileSync(path.join(root, 'lib/clip-worker-db.ts'), 'utf8')
assert.match(clipWorkerDb, /\.eq\('channel_id', channelId\)/)
const clipRender = readFileSync(path.join(root, 'lib/clip-render.ts'), 'utf8')
assert.match(clipRender, /\.eq\('channel_id', input\.channelId\)/)

console.log('PASS migration RLS, centralized session resolution, UI isolation, and storage scoping')
