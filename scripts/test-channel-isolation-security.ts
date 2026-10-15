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

const ingestRoute = readFileSync(path.join(root, 'app/api/ingest/run/route.ts'), 'utf8')
assert.match(ingestRoute, /getSessionFromRequest/)
assert.doesNotMatch(ingestRoute, /decodeSessionPayload|createHmac/)

const operatorApp = readFileSync(path.join(root, 'components/rbhq/OperatorApp.tsx'), 'utf8')
assert.match(operatorApp, /const canSwitchChannels = user\.role === "admin"/)
assert.match(operatorApp, /canSwitchChannels && channels\.length > 1/)

const mediaStorage = readFileSync(path.join(root, 'lib/media-storage.ts'), 'utf8')
assert.match(mediaStorage, /buildChannelStorageKey/)
assert.match(mediaStorage, /channelId: string/)

console.log('PASS migration RLS, centralized session resolution, UI isolation, and storage scoping')
