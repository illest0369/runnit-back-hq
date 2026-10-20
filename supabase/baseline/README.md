# Production public-schema baseline

The file 20261015_production_public.sql is a schema-only snapshot of the linked
production project's public schema, captured on 2026-10-15.

- SHA-256: 95fa71e16ac4983686d6332816b23d9995ccf1310b2ffbf36311d9380cd3e5ee
- Data, credentials, auth users, Storage objects, and Storage metadata are not
  included.
- The snapshot is a bootstrap artifact for an empty, initialized Supabase
  staging database. It is not a production migration and must never be applied
  to the existing production database.

## Reproduction order

1. Create an empty Supabase project or start a clean local Supabase stack.
2. Apply 20261015_production_public.sql.
3. Apply the repository migrations that production has not recorded, in order:
   - 202607310001_asset_retention.sql
   - 202610140001_channel_isolation_schema.sql
   - 202610140002_channel_assignment_backfill.sql
   - 202610140003_channel_isolation_rls.sql
   - 202610160001_source_suggestions_store.sql
   - 20261020013758_revoke_anon_public_access.sql
   - 20261020015306_phase1_release_security.sql
4. Run supabase db lint and the Phase 1 database, API, worker, Storage, and
   Realtime security suites against the isolated environment.

## Production migration history

Production already records `20261020013758_revoke_anon_public_access`; its SQL
has SHA-256
`02c8a6be306ac7c434008682509759de15d5b14209348b22e174894bdd67b8f2`.
The repository filename now matches that ledger entry exactly, so do not run a
separate migration-history repair for containment.

Five pending Phase 1 migrations sort before the recorded containment version;
the sixth pending migration is the post-containment release-security gate.
After approval, production deployment must therefore use
`supabase db push --include-all` and must first verify its `--dry-run` output.
The expected pending list is:

- 202607310001_asset_retention.sql
- 202610140001_channel_isolation_schema.sql
- 202610140002_channel_assignment_backfill.sql
- 202610140003_channel_isolation_rls.sql
- 202610160001_source_suggestions_store.sql
- 20261020015306_phase1_release_security.sql

The containment file must be reported as already applied and must not be run a
second time. Stop if the dry run differs from this list.

The RC2 local replay completed successfully on PostgreSQL 17 with 40 public
tables, RLS enabled on all 40 tables, an explicit policy on all 40, zero
anonymous-readable tables, and fixed search paths on all four public
application functions. `pgcrypto` is installed in the non-exposed `extensions`
schema, leaving zero anonymously executable functions in `public`. Because the
schema-only snapshot contains no production rows, a hosted isolated test is
still required to validate the final RC2 against hosted Supabase behavior and
live object relationships.
