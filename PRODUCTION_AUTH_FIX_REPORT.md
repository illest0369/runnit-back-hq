# RBHQ Production Auth Fix Report

**Date:** 2026-05-10  
**Scope:** Emergency Vercel production auth/env stabilization  
**Status:** PASS

## Root Cause

Vercel production env was expected to contain `APP_PIN`, `OWNER_USERNAME`, and `SESSION_SECRET`, but the deployed app code still read `OWNER_PIN` in `/api/login`. The production env entries also resolved as empty when pulled for verification, and earlier deployments were built before the final env correction.

## Stale Env Issues Found

- Code used `OWNER_PIN` while Vercel production had `APP_PIN`.
- Smoke test script used `OWNER_PIN`.
- Local example env used `OWNER_PIN`.
- Documentation still referenced `OWNER_PIN`.
- Existing production deployments were built before the final env standardization.
- Production auth env entries were replaced and production was redeployed with `--force` without retaining build cache.

## Auth Vars Currently Used

Only these auth variables are used:

- `APP_PIN`
- `OWNER_USERNAME`
- `SESSION_SECRET`

`OWNER_PIN` is no longer referenced anywhere in the repo.

## Production Validation Behavior

`/api/login` now fails clearly:

- Missing `APP_PIN` → `503 Server not configured: APP_PIN missing`
- Missing `OWNER_USERNAME` → `503 Server not configured: OWNER_USERNAME missing`
- Missing/short `SESSION_SECRET` → `503 Server not configured: SESSION_SECRET missing`

## Safe Startup Logging

On first login API boot, the app logs one safe, non-secret line:

```text
RBHQ_AUTH_ENV {"appPinPresent":true/false,"sessionSecretPresent":true/false,"ownerUsernamePresent":true/false,"nodeEnv":"..."}
```

No secret values are logged.

## Verification Results

Local:

- `npm run build` → pass
- `RBHQ_TEST_URL=http://localhost:3002 npm run security:smoke` → pass
- `/` redirects to `/login`
- `/login` loads
- logged-out `/dashboard` redirects to login
- protected APIs return 401
- invalid/tampered/expired cookies fail
- valid `APP_PIN` login reaches `/dashboard`

Production:

- Fresh production deploy completed with build cache skipped.
- Stable alias smoke passed: `https://ecstatic-haslett-e90db0.vercel.app`.
- Deployment URL smoke passed: `https://ecstatic-haslett-e90db0-p64mmb7o0-illest0369s-projects.vercel.app`.
- `/` redirects to `/login`.
- `/login` loads.
- Invalid PIN returns 401.
- Valid APP_PIN returns 200 and sets signed `rb_session`.
- Valid signed session reaches `/dashboard`.
- Logged-out protected APIs return 401.
- Tampered and expired cookies redirect/fail.

## Deployment URL

```text
https://ecstatic-haslett-e90db0.vercel.app
```

Latest deployment:

```text
https://ecstatic-haslett-e90db0-p64mmb7o0-illest0369s-projects.vercel.app
```
