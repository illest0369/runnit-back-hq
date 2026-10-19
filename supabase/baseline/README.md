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
   - 20261019025640_revoke_anon_public_access.sql
4. Run supabase db lint and the Phase 1 database, API, worker, Storage, and
   Realtime security suites against the isolated environment.

The 2026-10-15 local replay completed successfully on PostgreSQL 17 with 38
public tables, RLS enabled on all 38 tables, and no schema-lint warnings.
Because this snapshot contains no rows, a hosted production-clone test is still
required to validate production data backfills and live object relationships.
