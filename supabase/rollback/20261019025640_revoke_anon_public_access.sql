-- Exact rollback for 20261019025640_revoke_anon_public_access.sql.
-- Run only while the deployment freeze is still in effect: it restores the
-- audited 2026-10-18 production privilege model, including its unsafe anon
-- access, and must not be used after later migrations create public objects.
begin;

grant usage on schema public to anon;
grant all privileges on all tables in schema public to anon;
grant all privileges on all sequences in schema public to anon;
grant execute on all functions in schema public to public, anon;

alter default privileges for role postgres in schema public
  grant all privileges on tables to anon;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to anon;
alter default privileges for role postgres in schema public
  grant execute on functions to public, anon;

commit;
