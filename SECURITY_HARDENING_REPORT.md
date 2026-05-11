# RBHQ Security Hardening Report

**Date:** 2026-05-10  
**Scope:** Final pre-user-testing hardening pass  
**Status:** Ready for private owner-led testing

## What Was Fixed

- Session cookies are now HMAC-SHA256 signed with `SESSION_SECRET`.
- Sessions include `iat` and `exp`; the owner-testing timeout is 8 hours.
- Tampered, malformed, unsigned, expired, or secretless cookies fail closed.
- Production login fails with HTTP 503 if `APP_PIN`, `OWNER_USERNAME`, or a sufficiently long `SESSION_SECRET` is missing.
- API routes use the shared signed-session verifier and return 401 when unauthenticated.
- Middleware verifies signed sessions before allowing protected pages.
- `/api/process-clip` is now session-protected.
- `/api/approval` no longer forwards approved clips to a posting worker. Approval records the human decision only.
- Auth audit logging now emits structured `RBHQ_AUTH_AUDIT` lines for:
  - `login_success`
  - `login_failure`
  - `invalid_cookie`
  - `expired_session`
  - `unauthorized_api_attempt`
- `.env.local` and other local env files are ignored by git.
- `.env.local.example` documents required local variables without real secrets or demo credentials.

## Active Protections

| Protection | Implementation |
|---|---|
| Single owner account | `OWNER_USERNAME` env var |
| PIN validation | Server-side `APP_PIN` comparison |
| Signed session cookie | `payload.signature` HMAC using `SESSION_SECRET` |
| Session timeout | 8-hour `exp` checked in middleware and APIs |
| Cookie flags | `HttpOnly`, `SameSite=Lax`, `Max-Age=28800` |
| Brute-force lockout | 5 failed login attempts, 5-minute in-memory IP lockout |
| Protected pages | Middleware guards dashboard, clip, queue, publish, performance, intake |
| Protected APIs | Session required for session, clips, stats, notifications, approval, process-clip |
| No autonomous posting | Approval route records decisions; no posting worker call |
| API caching | `Cache-Control: no-store` for `/api/*` via `vercel.json` |

## Verified

- `npm run build` passes.
- `/login` loads.
- `/` redirects to `/login`.
- `/dashboard` redirects to `/login?next=%2Fdashboard` when logged out.
- Valid owner PIN login reaches `/dashboard`.
- Tampered cookie redirects to `/login`.
- Expired cookie redirects to `/login`.
- Expired cookie on `/api/session` returns 401.
- Unauthenticated `/api/session` returns 401.
- Unauthenticated `/api/clips` returns 401.
- Unauthenticated `/api/approval` returns 401.
- Unauthenticated `/api/process-clip` returns 401.
- No production PIN or session secret is present in client-side source.
- No committed demo credentials are required for login.
- No auth bypass path was found in app routes or API routes.
- Approval/posting surfaces remain behind RBHQ auth.

Repeatable local command:

```bash
RBHQ_TEST_URL=http://localhost:3002 npm run security:smoke
```

Production command after deploy:

```bash
RBHQ_TEST_URL=https://ecstatic-haslett-e90db0-mhpx4mcbw-illest0369s-projects.vercel.app npm run security:smoke
```

## Remaining Acceptable Preview Risks

- Rate limiting is still in process memory and resets on Vercel cold starts. This is acceptable for private owner-led preview testing only.
- TODO: move rate limiting to Redis/Upstash before broader use.
- Audit logs currently go to platform logs, not a persistent security event store.
- TODO: persist auth audit events in Redis/Supabase or another append-only store.
- No explicit logout route exists today, so no logout audit event is emitted.
- Session revocation is not implemented; session expiry is the current invalidation path.
- Static JSON data remains bundled with the deployment; no live database write-back exists yet.

## User Testing URL

Production:

```text
https://ecstatic-haslett-e90db0-mhpx4mcbw-illest0369s-projects.vercel.app
```

## Owner Login Steps

1. Open the production URL.
2. Confirm the app redirects to `/login`.
3. Enter the 6-digit owner PIN.
4. Confirm `/dashboard` opens and shows the owner dashboard.
5. Use the bottom nav to test Intake, Queue/Opus, Publish, and Stats.

## User Testing Checklist

- Login with the owner PIN.
- Refresh `/dashboard`; confirm the signed session persists.
- Open a private/incognito window; confirm protected pages redirect to `/login`.
- Navigate all protected tabs.
- Review clips without publishing externally.
- Approve/reject only test-safe items.
- Confirm approval actions update RBHQ state and do not trigger autonomous posting.
- Watch Vercel logs for `RBHQ_AUTH_AUDIT` entries during login, invalid cookie, and unauthenticated API checks.
