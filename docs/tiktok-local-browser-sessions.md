# TikTok Local Browser Sessions

RBHQ uses local browser automation for TikTok web upload preparation. This phase does not use the TikTok API, n8n Cloud, Metricool, or live auto-posting.

## Browser Profiles

Each TikTok account uses a separate persistent Playwright browser profile:

| Channel key | Profile directory |
| --- | --- |
| `rb_sports` | `tmp/browser-profiles/tiktok-rb-sports` |
| `rb_arena` | `tmp/browser-profiles/tiktok-rb-arena` |
| `rb_women` | `tmp/browser-profiles/tiktok-rb-women` |
| `rb_combat` | `tmp/browser-profiles/tiktok-rb-combat` |
| `rb_cfb` | `tmp/browser-profiles/tiktok-rb-cfb` |

The profiles live under `tmp/`, which is ignored by git. TikTok passwords are entered manually in the browser and are not stored in RBHQ code, env vars, or logs.

These are not your normal Chrome profile. The RB Sports profile resolves to:

```text
/Users/malyhernandez/Dev/rbhq/tmp/browser-profiles/tiktok-rb-sports
```

Normal Chrome profile data lives under `~/Library/Application Support/Google/Chrome/` on macOS. Do not point RBHQ at that directory; keep each operator account in its own project-local ignored profile.

## Safari / WebKit Feasibility

Safari is not a drop-in replacement for the current Playwright browser worker. Playwright can run a patched WebKit browser that is close to Safari, but it does not control your normal branded Safari app or reuse your signed-in Safari profile.

That means logging into TikTok in Safari will not make RBHQ's automated session-check or dry-run worker logged in. WebKit can still be tested with an isolated project-local profile:

```bash
npm run tiktok:web-upload-dry-run -- \
  --login \
  --channel rb_sports \
  --browser webkit \
  --headed \
  --timeout-ms 120000 \
  --artifact-dir ./tmp/tiktok-login-artifacts
```

Use WebKit only as an experiment if Chrome remains blocked. It is a separate browser profile, not your real Safari session.

## Manual Chrome CDP Fallback

If TikTok blocks login in the Playwright-launched Chrome window, use the manual Chrome CDP fallback. This opens installed Chrome with a project-local profile and only the debugging port needed for RBHQ to validate the upload page after login.

RB Sports manual Chrome profile:

```text
/Users/malyhernandez/Dev/rbhq/tmp/browser-profiles/tiktok-rb-sports-manual-chrome
```

This is still separate from your normal Chrome profile. It avoids using `~/Library/Application Support/Google/Chrome/`, and it keeps TikTok credentials out of RBHQ code, env vars, and logs.

Open the manual Chrome login window:

```bash
npm run tiktok:web-upload-dry-run -- \
  --login \
  --channel rb_sports \
  --browser cdp \
  --launch-cdp-chrome \
  --headed \
  --timeout-ms 120000 \
  --artifact-dir ./tmp/tiktok-login-artifacts
```

Log into `@runnitbacksports` in the Chrome window that opens. When login is complete, stop the terminal command with `Ctrl+C`.

Then validate the same profile reaches the upload page:

```bash
npm run tiktok:web-upload-dry-run -- \
  --session-check \
  --channel rb_sports \
  --browser cdp \
  --launch-cdp-chrome \
  --headed \
  --timeout-ms 120000 \
  --artifact-dir ./tmp/tiktok-login-artifacts
```

If Chrome is already open from the login command, you can also validate from a second terminal by attaching to the running browser:

```bash
npm run tiktok:web-upload-dry-run -- \
  --session-check \
  --channel rb_sports \
  --browser cdp \
  --cdp-endpoint http://127.0.0.1:9333 \
  --headed \
  --timeout-ms 120000 \
  --artifact-dir ./tmp/tiktok-login-artifacts
```

The CDP fallback does not provide a draft, stage an upload, fill a caption, click Post, call Metricool, call n8n, or mark anything published.

## Manual Login

Open the TikTok upload/login page for each account and log in manually:

```bash
npm run tiktok:login -- --channel rb_sports
npm run tiktok:login -- --channel rb_arena
npm run tiktok:login -- --channel rb_women
npm run tiktok:login -- --channel rb_combat
npm run tiktok:login -- --channel rb_cfb
```

Leave the browser open until login is complete, then stop the terminal command with `Ctrl+C`.

For RB Sports login setup, prefer installed Chrome, headed mode, and the project-local profile:

```bash
npm run tiktok:web-upload-dry-run -- \
  --login \
  --channel rb_sports \
  --headed \
  --chrome-only \
  --login-friendly \
  --timeout-ms 120000 \
  --artifact-dir ./tmp/tiktok-login-artifacts
```

`--login-friendly` is only allowed for login/session validation. It keeps the same project-local profile but asks Playwright not to add several noisy Chrome defaults such as disabled extensions, mock keychain, disabled sync, and disabled component update. Playwright still controls the browser through its debugging transport, so TikTok may still require QR login, challenge verification, or a normal device/browser trust period.

## Session Check

Check whether a profile currently has a TikTok session:

```bash
npm run tiktok:session-check -- --channel rb_sports
```

Use `--headed` if TikTok blocks the default headless check:

```bash
npm run tiktok:session-check -- --channel rb_sports --headed
```

For a post-login RB Sports upload-page validation in headed installed Chrome:

```bash
npm run tiktok:web-upload-dry-run -- \
  --session-check \
  --channel rb_sports \
  --headed \
  --chrome-only \
  --login-friendly \
  --timeout-ms 120000 \
  --artifact-dir ./tmp/tiktok-login-artifacts
```

This only checks whether the upload page is reachable. It does not provide a draft, stage an upload, fill a caption, click Post, call Metricool, call n8n, or mark anything published.

## Dry Run

Run the upload-page readiness proof for a saved n8n draft:

```bash
npm run tiktok:web-upload-dry-run -- --draft tmp/n8n-tiktok-drafts/<clip_id>.json --channel rb_sports
```

If the profile is logged out, the command returns `TIKTOK_LOGIN_REQUIRED` for that channel only.

After manual approval, a later dry-run can stage the MP4 and caption, but it still stops before final posting:

```bash
npm run tiktok:web-upload-dry-run -- --draft tmp/n8n-tiktok-drafts/<clip_id>.json --channel rb_sports --stage-upload --keep-open
```

The script never clicks the final TikTok Post button in the current phase, and RBHQ is never marked published by this browser proof.
