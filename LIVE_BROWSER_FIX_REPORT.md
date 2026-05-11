# RBHQ Live Browser Fix Report

**Date:** 2026-05-10  
**Production URL:** `https://ecstatic-haslett-e90db0.vercel.app`  
**Latest production deployment:** `https://ecstatic-haslett-e90db0-p64mmb7o0-illest0369s-projects.vercel.app`  
**Status:** PASS

## Reproduced Symptom

The live site was tested in a real browser session, not only with CLI smoke checks.

Initial browser reproduction showed a Vercel-owned `403: Forbidden` page on both:

- `https://ecstatic-haslett-e90db0.vercel.app/`
- `https://ecstatic-haslett-e90db0.vercel.app/login`

The browser page had no RBHQ UI, no app login form, and no browser console errors. This pointed to the Vercel access/deployment layer, not a React hydration error or RBHQ login UI failure.

## Root Cause

The login flow itself was not the failing layer. The production project had recently changed auth environment variables and deployment protection/auth settings, but older deployments could still have stale Vercel state.

The stable production alias needed a clean production redeploy after the env/protection changes. After the no-cache production deployment, the stable alias resolved to the latest Ready deployment and the browser could load RBHQ normally.

## Vercel Settings Verified

- Vercel Authentication / SSO protection: off (`ssoProtection: null`)
- Password protection: off (`passwordProtection: null`)
- Deployment protection: off (`deploymentProtection: null`)
- Stable production alias: `ecstatic-haslett-e90db0.vercel.app`
- Stable alias target: latest no-cache production deployment

## Production Env Verified

Production env vars present:

- `APP_PIN`: yes
- `OWNER_USERNAME`: yes
- `SESSION_SECRET`: yes

Production env vars checked but not required by current runtime:

- `SUPABASE_URL`: no
- `SUPABASE_SERVICE_ROLE_KEY`: no
- `REDIS_URL`: no

No secret values were printed or recorded.

## Code Env Names Verified

Current auth code uses:

- `APP_PIN`
- `OWNER_USERNAME`
- `SESSION_SECRET`

`OWNER_PIN` is no longer used by runtime auth code. Remaining mentions are historical documentation/report context only.

## Build And Deployment

- `npm run build`: pass
- Production deployment: pass
- Vercel build cache: skipped on production redeploy
- Deployment status: Ready

## Browser Verification Result

Real browser session against `https://ecstatic-haslett-e90db0.vercel.app`:

- `/` redirects to `/login`: pass
- `/login` visibly renders RBHQ PIN pad: pass
- Wrong PIN shows `Invalid PIN`: pass
- Correct owner PIN redirects to `/dashboard`: pass
- `/dashboard` visibly renders owner dashboard with `ALL CLEAR`: pass
- Refreshing `/dashboard` keeps the signed session: pass
- Browser console errors: none observed

Screenshots were captured in the live browser session for the login screen and dashboard. File export from the in-app browser runtime was not available, so no local screenshot path is attached.

## HTTP/API Verification

Stable production URL:

- `GET /`: `307` to `/login`
- `GET /login`: `200`
- `GET /dashboard` logged out: `307` to `/login?next=%2Fdashboard`
- `POST /api/login` with invalid PIN: `401`
- `GET /api/session` logged out: `401`
- `GET /api/clips` logged out: `401`
- `GET /api/notifications` logged out: `401`
- `GET /api/stats` logged out: `401`
- `POST /api/approval` logged out: `401`
- `POST /api/process-clip` logged out: `401`

Repeatable smoke command:

```bash
RBHQ_TEST_URL=https://ecstatic-haslett-e90db0.vercel.app npm run security:smoke
```

Result: pass, including valid login, signed session dashboard access, tampered cookie rejection, expired cookie rejection, and expired API session `401`.

## Final Login Flow

1. Open `https://ecstatic-haslett-e90db0.vercel.app`.
2. Browser redirects to `/login`.
3. RBHQ owner PIN pad renders.
4. Enter the owner PIN.
5. Browser reaches `/dashboard`.
6. Dashboard remains available after refresh while the signed session is valid.

## Remaining Notes

- The current in-memory rate limiter is still acceptable only for private owner-led testing.
- Redis/Upstash-backed rate limiting remains the correct later hardening step.
- No OAuth, signup, multi-user auth, platform expansion, or TikTok posting behavior was added.
