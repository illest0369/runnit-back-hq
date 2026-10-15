import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migrationPaths = [
  'supabase/migrations/202610140001_channel_isolation_schema.sql',
  'supabase/migrations/202610140002_channel_assignment_backfill.sql',
  'supabase/migrations/202610140003_channel_isolation_rls.sql',
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
  /rbhq_install_direct_policy\('source_channels', 'target_rbhq_channel_id'\)/i,
  /alter table public\.ingested_videos enable row level security/i,
  /alter table public\.video_transcripts enable row level security/i,
  /rbhq_install_direct_policy\('clip_candidates', 'target_channel_id'\)/i,
  /rbhq_install_direct_policy\('mac_mini_clip_packages', 'target_channel_id'\)/i,
  /having count\(distinct legacy\.channel_id\) = 1/i,
  /force row level security/i,
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

const clipWorkerDb = readFileSync(path.join(root, 'lib/clip-worker-db.ts'), 'utf8')
assert.match(clipWorkerDb, /\.eq\('channel_id', channelId\)/)
const clipRender = readFileSync(path.join(root, 'lib/clip-render.ts'), 'utf8')
assert.match(clipRender, /\.eq\('channel_id', input\.channelId\)/)

console.log('PASS migration RLS, centralized session resolution, UI isolation, and storage scoping')
