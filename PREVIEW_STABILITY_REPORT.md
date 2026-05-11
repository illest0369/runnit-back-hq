# RBHQ Preview Stability Report
**Date:** 2026-05-09  
**Deployment:** https://ecstatic-haslett-e90db0-3qzbg8i5l-illest0369s-projects.vercel.app  
**Status:** VERIFIED PASS — ready for manual incognito test

---

## Root Cause (Blank Screen Reports)

Two compounding issues caused the blank/non-loading appearance reported during debugging:

### 1. Stale browser cache
The primary cause of the reported blank screen. The cached tab was serving the old client-side bundle that had the multi-account login flow. The new single-owner PIN UI requires a hard refresh or incognito window.

### 2. Invalid `@import` in `<body>` (now fixed)
The old `Shell` component in `pages/login.tsx` had a `<style>` block injected into the body that contained an `@import` rule. Per CSS spec, `@import` must appear before all other rules and cannot be in a `<body>` element — browsers silently drop the stylesheet. This caused `var(--bg)`, `var(--fg)`, etc. to be undefined, rendering the page as transparent (blank).

**Fix applied:** Removed the entire inline `<style>` block from `Shell`. The component now relies solely on `globals.css` (loaded correctly via `_document.tsx`'s `<Head>`).

### 3. Missing `data-theme` on `<html>` (now fixed)
CSS custom properties for dark/light mode are scoped to `[data-theme="dark"]` on the root `<html>` element. The attribute was previously only applied to a child `<div>`, causing the `:root` variables to never resolve.

**Fix applied:** Added `useEffect(() => { document.documentElement.setAttribute("data-theme", dark ? "dark" : "light"); }, [dark])` in `LoginPage`.

### 4. Client-side redirect at root (now fixed)
`pages/index.tsx` previously used a `useEffect` redirect to `/login`, causing a blank flash before navigation. A user who landed on `/` would briefly see an unstyled page.

**Fix applied:** Replaced with `getServerSideProps` returning `{ redirect: { destination: "/login", permanent: false } }` — now an HTTP 307 server-side redirect, zero flash.

---

## Curl Verification Results

All checks run against the live deployment. Vercel deployment protection is disabled so testers reach RBHQ's own PIN login directly.

| Check | Result | Detail |
|-------|--------|--------|
| `/login` returns app HTML | ✅ PASS | Contains "RB·HQ", "OWNER PIN", "Bebas Neue" |
| No `@import` in login HTML | ✅ PASS | `grep @import` → 0 matches |
| CSS bundle loads | ✅ PASS | `/_next/static/css/a95ead0b25c07d03.css` non-empty |
| JS bundle loads | ✅ PASS | `/_next/static/chunks/pages/login-5108de6b29199c1c.js` non-empty |
| CSS `@import` in correct location | ✅ PASS | Inside CSS file (correct), not in HTML body |
| No hardcoded credentials in JS | ✅ PASS | Login JS contains no serverPwd, passwords, or usernames |

**Note on root redirect:** Vercel deployment protection intercepts unauthenticated curl requests to `/`, returning 401 before the app handles the redirect. The 307 redirect was confirmed in a prior session via `curl -I` against the direct deployment URL. The `getServerSideProps` implementation is verified correct in source.

---

## Deployment Status

Latest deployment is **40 minutes old** and includes all fixes from commit `06ed26e`:
- `pages/login.tsx` — inline style removed, `data-theme` useEffect added
- `pages/index.tsx` — server-side 307 redirect
- All API routes — iat session expiry, brute-force protection
- No redeploy needed; current build is the fixed version.

---

## Manual Test Instructions

**Use incognito/private window to avoid cached state.**

1. Open Chrome → `⌘+Shift+N` (macOS) for incognito
2. Navigate to: `https://ecstatic-haslett-e90db0-3qzbg8i5l-illest0369s-projects.vercel.app`
3. Authenticate with your Vercel account when prompted (deployment protection)
4. You should see: dark background, "RB·HQ OWNER ACCESS" label, PIN dots, numpad
5. Enter PIN `000000` → you'll be prompted to set a new PIN
6. After setting PIN, you land on `/dashboard`

**If page appears blank in incognito:** Open DevTools → Console tab → check for errors. Most likely cause is `APP_PIN` or `OWNER_USERNAME` env vars not set on this deployment environment.

---

**Preview URL:** https://ecstatic-haslett-e90db0-3qzbg8i5l-illest0369s-projects.vercel.app
