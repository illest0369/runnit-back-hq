# Phase 1 Channel Assignment Plan

Status: owner-approved mapping included in the local, undeployed Stage 2
migration; production assignment not applied.

## Owner-approved assignment

| Operator | Database user ID | Required role | Channel | Database channel ID | TikTok |
|---|---|---|---|---|---|
| `thomas` | `d661928a-95a7-40e6-862d-fb18e78bf583` | `operator` | `RB CFB` | `93484eef-06d8-46fd-bce2-ce252422c58e` | `@runnitbackcfb` |

The identifiers were verified read-only against production on 2026-10-15. The
user row has role `operator`; it must never be changed to `admin` or
`super_admin`. The channel row has name `RB CFB` and handle
`runnitbackcfb`. Thomas's existing `user_settings.default_channel_id` already
points to the verified RB CFB channel. He currently has no legacy
`user_channels` row, and production does not yet have the Phase 1
`operator_channel_assignments` table.

## Approved deployment sequence

This sequence is planning only. It requires separate production deployment
approval.

1. Capture a fresh read-only snapshot of all user roles, legacy channel
   assignments, and default-channel settings.
2. Re-run the identity predicates above and abort on any mismatch, duplicate
   username, non-operator role, different channel name, or different normalized
   TikTok handle.
3. Apply the additive Phase 1 schema migration that creates
   `operator_channel_assignments`.
4. Apply the Stage 2 data migration. In its single transaction it validates and
   inserts only the verified Thomas-to-RB-CFB row, then runs the conflict-safe
   legacy backfill for the other 15 operators. It aborts if Thomas already has a
   different assignment and treats an existing exact row as idempotent success.
   It does not update his role or default-channel setting.
5. Before enabling RLS or application traffic, require all of these assertions:
   - Thomas has exactly one assignment and it is RB CFB.
   - Every other operator's assignment matches the pre-deployment snapshot.
   - Every operator has exactly one assignment.
   - No operator has an `admin` or `super_admin` role.
   - Admin/super-admin authorization remains role-based and unrestricted; no
     operator assignment is used to grant global access.
6. Apply the Phase 1 RLS migration and rerun the database, API, worker, Storage,
   queue, and Realtime cross-channel denial suites before resuming traffic.

## Change boundary

The approved assignment delta contains one row only: Thomas to RB CFB. All
other assignments, roles, credentials, social-account settings, and channel
isolation rules are out of scope and must remain unchanged. Any failed
precondition or post-deployment assertion is a rollback/NO-GO condition.
