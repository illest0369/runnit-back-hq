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

## Session Check

Check whether a profile currently has a TikTok session:

```bash
npm run tiktok:session-check -- --channel rb_sports
```

Use `--headed` if TikTok blocks the default headless check:

```bash
npm run tiktok:session-check -- --channel rb_sports --headed
```

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
