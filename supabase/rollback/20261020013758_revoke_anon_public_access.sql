-- The anonymous-access containment is intentionally non-reversible by an
-- automated SQL rollback. Restoring its legacy ACLs would reopen the incident
-- and would also expose public objects created after containment.
--
-- Application rollback is compatible with the contained ACL model. If a
-- production incident proves that a specific authenticated/service-role grant
-- is missing, prepare and review a forward recovery migration for only that
-- object and privilege. Never restore blanket anon or PUBLIC access.
begin;

do $unsafe_rollback_blocked$
begin
  raise exception 'RBHQ_UNSAFE_ROLLBACK_BLOCKED: use a reviewed forward recovery migration; anonymous access must remain contained';
end
$unsafe_rollback_blocked$;

rollback;
