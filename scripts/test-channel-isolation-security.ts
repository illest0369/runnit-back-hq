import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migrationPath = path.join(root, 'supabase/migrations/202610140001_channel_isolation.sql')
const migration = readFileSync(migrationPath, 'utf8')

const requiredSql = [
  /create table if not exists public\.operator_channel_assignments/i,
  /user_id uuid primary key/i,
  /channel_id uuid not null/i,
  /create or replace function public\.rbhq_is_super_admin/i,
  /create or replace function public\.rbhq_current_channel_id/i,
  /create or replace function public\.rbhq_can_access_channel/i,
  /alter table public\.channels enable row level security/i,
  /alter table public\.operator_channel_assignments enable row level security/i,
  /alter table public\.clips enable row level security/i,
  /alter table public\.source_channels enable row level security/i,
  /alter table public\.ingested_videos enable row level security/i,
  /alter table public\.video_transcripts enable row level security/i,
  /alter table public\.clip_candidates enable row level security/i,
  /alter table public\.mac_mini_clip_packages enable row level security/i,
  /having count\(distinct legacy\.channel_id\) = 1/i,
  /force row level security/i,
  /rbhq_channel_isolation/i,
  /rbhq_super_admin_only/i,
  /grant select, insert, update, delete on public\.operator_channel_assignments to authenticated/i,
  /rbhq_can_access_channel/i,
]

for (const pattern of requiredSql) {
  assert.match(migration, pattern, `migration is missing security control ${pattern}`)
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
assert.doesNotMatch(ingestRoute, /decodeSessionPayload|createHmac/)

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
assert.match(worker, /assertChannelQueueScope/)

console.log('PASS migration RLS, centralized session resolution, UI isolation, and storage scoping')
