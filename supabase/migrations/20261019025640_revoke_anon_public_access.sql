-- Emergency containment for the legacy anonymous Data API surface.
--
-- This migration intentionally leaves authenticated and service_role grants,
-- policies, and application data unchanged. Channel-scoped authenticated RLS
-- remains the responsibility of the Phase 1 isolation migrations.
begin;

revoke usage on schema public from anon;
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove both
-- that inherited route and Supabase's direct anon grant while retaining the
-- explicit authenticated and service_role grants.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Keep future postgres-owned public objects closed to anon as well.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated, service_role;

commit;
