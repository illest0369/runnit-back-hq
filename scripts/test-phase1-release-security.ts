import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migrationsDir = path.join(root, 'supabase/migrations')
const rollbackDir = path.join(root, 'supabase/rollback')
const containmentVersion = '20261020013758'
const containmentFilename = `${containmentVersion}_revoke_anon_public_access.sql`
const staleContainmentFilename = '20261019025640_revoke_anon_public_access.sql'

assert.equal(
  existsSync(path.join(migrationsDir, staleContainmentFilename)),
  false,
  'the repository must not advertise the stale containment migration version',
)
assert.equal(
  existsSync(path.join(migrationsDir, containmentFilename)),
  true,
  'the local containment filename must match the production migration ledger',
)

const hardeningFilenames = readdirSync(migrationsDir)
  .filter((filename) => filename.endsWith('_phase1_release_security.sql'))
assert.equal(hardeningFilenames.length, 1, 'exactly one Phase 1 release-security migration is required')

const hardeningFilename = hardeningFilenames[0]
assert(hardeningFilename, 'Phase 1 release-security migration filename is required')
assert(
  hardeningFilename.localeCompare(containmentFilename) > 0,
  'release-security hardening must sort after the applied containment migration',
)
const hardening = readFileSync(path.join(migrationsDir, hardeningFilename), 'utf8')

for (const functionName of [
  'refresh_clip_source_counts',
  'refresh_clip_source_counts_trigger',
  'set_clip_sources_updated_at',
  'set_clips_updated_at',
]) {
  assert.match(
    hardening,
    new RegExp(`create or replace function public\\.${functionName}`, 'i'),
    `${functionName} must be recreated with a fixed search path`,
  )
}
assert.match(hardening, /set search_path = ''/i)
assert.match(hardening, /update public\.clip_sources/i)
assert.match(hardening, /from public\.clips/i)
assert.match(hardening, /perform public\.refresh_clip_source_counts/i)
assert.match(hardening, /revoke execute on all functions in schema public from public, anon/i)
assert.match(hardening, /revoke all privileges on all tables in schema public from anon/i)

for (const legacyPolicy of [
  'anon_select_channels',
  'anon_select_posts',
  'anon_update_posts',
  'anon_select_user_channels',
  'anon_select_users',
  'anon_insert_audit_logs',
  'anon_select_audit_logs',
  'learning_weights_all',
  'reply_feedback_all',
  'reply_sessions_all',
  'Users can manage own settings',
]) {
  assert.match(
    hardening,
    new RegExp(`drop policy if exists "?${legacyPolicy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"? on public\\.`, 'i'),
    `legacy allow-all policy ${legacyPolicy} must be removed`,
  )
}

assert.match(hardening, /RBHQ_RLS_DISABLED/i)
assert.match(hardening, /RBHQ_RLS_POLICY_MISSING/i)
assert.doesNotMatch(hardening, /grant\s+.+\s+to\s+anon/i)

const rollbackFiles = readdirSync(rollbackDir).filter((filename) => filename.endsWith('.sql'))
for (const rollbackFilename of rollbackFiles) {
  const rollback = readFileSync(path.join(rollbackDir, rollbackFilename), 'utf8')
  assert.doesNotMatch(
    rollback,
    /grant all privileges on all tables in schema public to anon/i,
    `${rollbackFilename} must not restore blanket anonymous table access`,
  )
  assert.doesNotMatch(
    rollback,
    /grant execute on all functions in schema public to public, anon/i,
    `${rollbackFilename} must not restore blanket anonymous function execution`,
  )
}

const hostedRls = readFileSync(path.join(root, 'scripts/test-hosted-rls.ts'), 'utf8')
assert.doesNotMatch(hostedRls, /thomas/i, 'hosted RLS verification must not depend on Thomas')
assert.match(hostedRls, /rb-cfb/i)
assert.match(hostedRls, /createSmokeOperator/i)
assert.match(hostedRls, /verifyAdminAccess/i)

console.log('PASS release ledger, hardening, rollback, and simulated-session security controls')
