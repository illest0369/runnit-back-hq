# RBHQ Phase 1 production launch — RC2

Status: **NO-GO for production deployment** until the blockers below are
cleared and the owner explicitly approves production changes. Production was
read-only throughout RC2 preparation.

## Frozen release contents

- Base: `19e92e940f8992a6d93332526473069d432b6dfb` (`rbhq-phase1-rc.1`).
- Branch: `codex/phase1-production-rc2`.
- Production containment ledger version:
  `20261020013758_revoke_anon_public_access`.
- Containment SQL SHA-256:
  `02c8a6be306ac7c434008682509759de15d5b14209348b22e174894bdd67b8f2`.
- Post-containment hardening:
  `20261020015306_phase1_release_security.sql`.
- Live publishing defaults to disabled. Direct TikTok, Metricool, and n8n live
  paths all require `RBHQ_RB_CFB_LIVE_POSTING_ALLOWED=true` for RB CFB.

No operator account, login, password, or browser session is required for the
RB CFB authorization tests. The tests create disposable simulated identities.

## Current evidence

- Production migration ledger: eight legacy migrations plus
  `20261020013758_revoke_anon_public_access`.
- A production-linked `db push --include-all --dry-run --skip-vault` reported
  exactly the six expected pending files; the remote ledger remained unchanged.
- Production containment remains effective: anonymous table access and public
  application-function execution are denied.
- Production and the clean replay both keep `pgcrypto` in the non-exposed
  `extensions` schema; the clean replay now enforces that placement instead of
  creating extension RPCs in `public`.
- Local production-baseline replay: 40 public tables, 0 without RLS, 0 without
  policies, 0 anonymously readable, 40 readable by authenticated and
  service-role workflows.
- Public application functions: four of four are security-invoker functions
  with `search_path=''`; anonymous execute is denied and authenticated/service
  execution remains available.
- Effective ACL audit: no `anon`, `authenticated`, or `service_role` role
  inheritance; zero anonymous public-relation privileges; zero anonymously
  executable public functions; postgres default ACLs grant only authenticated
  and service-role access to future public objects.
- Legacy allow-all policies remaining after replay: 0.
- Simulated RB CFB operator: exactly one visible channel, one visible
  assignment, one visible channel suggestion, and foreign-channel insert
  denied.
- Simulated administrator: both test channels, both assignments, and both
  channel suggestions visible; cross-channel writes allowed.
- Build, TypeScript, worker build, backend health tests, RunPod adapter tests,
  channel-isolation tests, queue-readiness smoke, operator staging UX,
  Metricool manual export, n8n manual/test-mode flow, and the Mac mini dry-run
  worker pass.
- Railway staging: Redis, backend, and clip-worker deployments report RUNNING;
  Redis has a ready persistent volume. Backend `/health` returns 200.
- Railway staging `/ready` returns 503 because Supabase is currently false;
  Redis is true.
- RunPod endpoint `/health` returns 200. No job was submitted; GPU calls: 0.
- Isolated BullMQ/Redis dry run: one completed, zero failed, queue removed;
  GPU calls: 0.
- Recent hosted worker evidence includes successful 1080x1920 RunPod renders,
  followed by successful BullMQ job completion. It also exposed a non-fatal
  missing `public.publish_events` audit store; RC2 now adds that table with RLS
  and channel isolation, and its clean local replay passes.

## Remaining blockers

1. Staging backend readiness is red because its Supabase dependency is not
   currently healthy/configured (`/ready` 503). Do not promote while this gate
   is red.
2. The final RC2 hardening migration has passed a full local replay but has not
   been rerun in an active hosted isolated Supabase environment. No new hosted
   infrastructure may be created without approval.
3. Railway backend has no configured deployment healthcheck path. Configure
   `/health` before production promotion so a failed replacement does not take
   traffic.
4. The final hosted smoke must confirm the new `publish_events` relation is in
   PostgREST's schema cache and records the worker event without error.
5. The build succeeds but retains six pre-existing Turbopack dynamic-filesystem
   trace warnings. They do not fail the build, but deployment artifact size
   should be checked before promotion.
6. TikTok live posting is intentionally disabled. RB CFB must remain inactive
   until separately authorized; this is not an operator-onboarding blocker.

## Exact production deployment procedure

Do not begin until a fresh encrypted backup and ACL snapshot are verified and
the owner approves production migration/deployment.

1. Freeze writes and record the currently active application and Railway
   deployment IDs.
2. Verify the encrypted backup hashes and authenticated decryption; restore a
   sample into isolation.
3. Run `supabase migration list` and require the production ledger to end at
   `20261020013758_revoke_anon_public_access` before Phase 1.
4. Run
   `supabase db push --project-ref jcrgqvcmpguomyjfjvtl --include-all --dry-run --skip-vault`.
   Require exactly these six pending migrations, in this order:
   1. `202607310001_asset_retention.sql`
   2. `202610140001_channel_isolation_schema.sql`
   3. `202610140002_channel_assignment_backfill.sql`
   4. `202610140003_channel_isolation_rls.sql`
   5. `202610160001_source_suggestions_store.sql`
   6. `20261020015306_phase1_release_security.sql`
5. Stop if containment appears pending, if any unexpected migration appears,
   or if the assignment gate reports a missing/multiple operator assignment.
6. With approval, run
   `supabase db push --project-ref jcrgqvcmpguomyjfjvtl --include-all --skip-vault`
   once. Do not run a separate ledger repair and do not permit the migration
   command to synchronize Vault secrets.
7. Immediately verify: migration ledger, all public-table RLS/policy counts,
   anonymous REST/RPC denial, GraphQL data isolation, admin all-channel access,
   simulated RB CFB one-channel access, service-role worker reads/writes, and
   function search paths/ACLs.
8. Deploy the application release with `RBHQ_TIKTOK_LIVE_POSTING_ALLOWED=false`
   and `RBHQ_RB_CFB_LIVE_POSTING_ALLOWED=false`. Configure Railway `/health`
   before switching traffic.
9. Run smoke tests in this order: `/health`, `/ready`, administrator login and
   all-channel view, simulated RB CFB session, foreign-channel denial, one
   isolated queue dry run, R2 presign validation, RunPod health only, Metricool
   manual export, n8n test mode, and TikTok dry-run package creation. Submit no
   GPU render and no live post during the launch smoke.
10. Keep the write freeze until logs and audit rows show no authorization,
    queue, or schema errors.

## Rollback

- Do not restore anonymous grants. The containment rollback intentionally
  aborts with `RBHQ_UNSAFE_ROLLBACK_BLOCKED`.
- Each schema migration is transactional. If one fails, stop and identify the
  last ledger entry; do not rerun the whole sequence blindly.
- The Phase 1 changes are additive and the previous application release is
  compatible with the contained ACL model. Roll Railway back to the recorded
  last-good deployment while leaving the security schema in place.
- If an authenticated or service workflow lacks one privilege, create a
  reviewed forward recovery migration granting only that privilege on that
  object. Never use blanket `GRANT ALL ... TO anon` or PUBLIC function execute.
- If data integrity is damaged, keep production offline and restore from the
  verified encrypted backup into isolation first. Promote a restore only after
  row counts, assignments, quarantine data, ACLs, and RLS gates pass.
