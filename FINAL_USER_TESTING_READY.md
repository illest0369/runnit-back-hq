# RBHQ Final User Testing Ready

**Date:** 2026-05-10  
**Status:** Ready for private owner-led user testing after final production verification  
**App:** RBHQ / Runnit Back HQ

## Testing URL

```text
https://ecstatic-haslett-e90db0-mhpx4mcbw-illest0369s-projects.vercel.app
```

## Owner Login

1. Open the testing URL.
2. You should land on `/login`.
3. Enter the 6-digit owner PIN.
4. Successful login redirects to `/dashboard`.
5. Session lasts up to 8 hours, then protected pages redirect back to `/login`.

## What Is Ready

- Production loads without Vercel Authentication blocking users.
- RBHQ internal PIN/session auth is active.
- Session cookies are signed with `SESSION_SECRET`.
- Tampered, malformed, unsigned, and expired cookies are rejected.
- Protected pages redirect to `/login` when logged out.
- Protected APIs return 401 without a valid session.
- Auth events are logged as `RBHQ_AUTH_AUDIT`.
- Rate limiting remains enabled on login attempts.
- Approval is human-driven.
- No OAuth, signup, multi-user auth, new platforms, or feature expansion was added.
- No autonomous TikTok posting is performed by the RBHQ approval API.

## Owner Testing Checklist

- Confirm `/login` loads.
- Confirm `/` redirects to `/login`.
- Confirm logged-out `/dashboard`, `/clip`, `/queue`, `/publish`, `/performance`, and `/intake` redirect to `/login`.
- Log in with the owner PIN.
- Confirm `/dashboard` renders.
- Visit each bottom-nav section: Home, Intake, Opus, Publish, Stats.
- Confirm session survives refresh.
- Confirm incognito/private window requires login.
- Confirm approval/rejection actions are intentional and test-safe.
- Confirm no external TikTok post is created automatically.

## Verification Commands

Local:

```bash
npm run build
RBHQ_TEST_URL=http://localhost:3002 npm run security:smoke
```

Production after deploy:

```bash
RBHQ_TEST_URL=https://ecstatic-haslett-e90db0-mhpx4mcbw-illest0369s-projects.vercel.app npm run security:smoke
```

## Remaining Preview Risks Accepted

- Login rate limiting is in memory and resets on cold starts.
- TODO: replace in-memory limiter with Redis/Upstash before wider release.
- Audit logs are currently platform logs, not a durable audit table.
- TODO: persist auth audit events before wider release.
- No logout route exists yet.
- No database write-back exists; data remains static JSON for this MVP.

## Stop Conditions During Testing

- Login does not reach `/dashboard`.
- A protected page opens while logged out.
- A protected API returns data while logged out.
- A tampered cookie is accepted.
- Any approval action posts externally without an explicit owner-controlled posting step.
