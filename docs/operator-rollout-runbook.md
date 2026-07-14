# RBHQ Limited Rollout Operator Runbook

Use this for the limited RBHQ rollout while TikTok login cooldown remains the only hard blocker. The goal is to review high-signal candidates, prepare packages, attach local assets, and run safe dry-runs only when TikTok is logged in.

## Hard Boundaries

Operators must not:

- Click TikTok final `Post`.
- Run `--live-post`, `--allow-final-post`, or set `RBHQ_TIKTOK_LIVE_POSTING_ALLOWED=true`.
- Touch TikTok login automation beyond the explicit session check/manual login runbook.
- Change auth, Queue API mutations, cron, Metricool, n8n, live publish, or final publish behavior.
- Attach assets outside `MAC_MINI_ASSET_ROOT`.
- Treat `TIKTOK_LOGIN_REQUIRED` as a content or package problem.

## Daily Plan Review

Open production and start with `Plan`.

- Prioritize `Top Clips To Post Now`.
- Read score, rank, urgency, viral signals, and `Why now`.
- Confirm the caption and hashtags match the lane and story.
- Use `Strong Alternates` only when top clips are blocked by missing source, weak timing, or package/asset issues.
- Use `Hold / Low Priority` as filler only after higher-urgency clips are handled.

## Queue Review

Open `Queue`.

- Review viral score, rank, urgency, and viral signal chips.
- Check `Why now`, operator summary, caption, and hashtags before approving.
- Confirm package readiness chips:
  - `Clip Prep ready` means timed prep is usable.
  - `Metadata-only Prep` means a human must verify the moment manually.
  - `Asset missing` means the Mac mini package needs a local MP4 attached.
  - `TikTok login required` means stop TikTok staging until the local profile is logged in.

## Moment Selection

Use the AI recommendation unless the operator sees a cleaner 1-60 second viral beat.

Accept AI timestamps:

```bash
npm run moment:select -- --candidate-id <clip_candidate_id> --selected-by <operator_name>
```

Override timestamps:

```bash
npm run moment:select -- \
  --candidate-id <clip_candidate_id> \
  --start-seconds <start> \
  --end-seconds <end> \
  --selected-by <operator_name>
```

Expected result: candidate status becomes `approved_for_handoff`, and operator-selected timestamps are persisted.

## Clip Prep

Refresh Clip Prep after moment selection:

```bash
npm run clip-prep:refresh -- --candidate-id <clip_candidate_id>
```

or from a package:

```bash
npm run clip-prep:refresh -- --package-id <package_id>
```

Read:

- `status`: `ready` or `metadata_only`.
- `suggested_clip_start_seconds` / `suggested_clip_end_seconds`.
- `opening_text`.
- `clip_reason`.
- `asset_instructions`.

If status is `metadata_only`, manually verify the strongest moment before rendering.

## Package Creation

Create the Mac mini package after moment selection and Clip Prep:

```bash
npm run handoff:mac-mini:package -- --candidate-id <clip_candidate_id>
```

Show package details:

```bash
npm run handoff:mac-mini:show -- --package-id <package_id>
```

Confirm `publishAction` is `dry_run`, lane resolves to the intended browser channel, and package safety flags prohibit final Post.

## Local Render Prep

Render from package source metadata and attach automatically:

```bash
npm run clip-prep:render-local -- --package-id <package_id> --attach
```

Render from a local source MP4:

```bash
npm run clip-prep:render-local -- \
  --package-id <package_id> \
  --source-path /path/to/source.mp4 \
  --attach
```

Optional asset root:

```bash
npm run clip-prep:render-local -- \
  --package-id <package_id> \
  --asset-root "$MAC_MINI_ASSET_ROOT" \
  --attach
```

Expected result: rendered MP4 path is inside the asset root and package `assetStatus` becomes `attached`.

## Attach Existing Asset

Set Mac mini environment:

```bash
export RBHQ_BASE_URL="https://runnitbackhq.com"
export MAC_MINI_WORKER_TOKEN="<worker-token>"
export MAC_MINI_ASSET_ROOT="/Users/<operator>/rbhq-assets"
```

Attach a reviewed local MP4:

```bash
npm run handoff:mac-mini:attach-asset -- \
  --package-id <package_id> \
  --asset-path "$MAC_MINI_ASSET_ROOT/<package_id>.mp4"
```

Verify:

```bash
npm run handoff:mac-mini:show -- --package-id <package_id>
```

Expected fields: `assetStatus=attached`, `localAssetPath=<mp4_path>`, `assetError=null`.

## TikTok Session Check

Stable profile root:

```bash
export TIKTOK_BROWSER_PROFILE_ROOT="$HOME/rbhq-browser-profiles"
```

Check RB Sports:

```bash
TIKTOK_BROWSER_PROFILE_ROOT="$HOME/rbhq-browser-profiles" \
  npm run tiktok:session-check -- --channel rb_sports
```

Interpretation:

- `logged_in=true` and `loginRequired=false`: dry-run staging may proceed.
- `TIKTOK_LOGIN_REQUIRED`: stop. The local browser profile is logged out or cooled down.
- Challenge/access-block text: stop and record the blocker. Do not retry repeatedly.

## Mac Mini Dry-Run

Run metadata-only package check:

```bash
npm run handoff:mac-mini:run-dry-run -- --limit 1
```

Run one safe browser staging attempt only after session check passes and asset is attached:

```bash
TIKTOK_BROWSER_PROFILE_ROOT="$HOME/rbhq-browser-profiles" \
  npm run handoff:mac-mini:run-dry-run -- --limit 1 --stage-upload
```

Optional CDP/manual Chrome path:

```bash
TIKTOK_BROWSER_PROFILE_ROOT="$HOME/rbhq-browser-profiles" \
  npm run handoff:mac-mini:run-dry-run -- \
  --limit 1 \
  --stage-upload \
  --browser cdp \
  --launch-cdp-chrome \
  --timeout-ms 120000
```

Expected dry-run result:

- Correct lane profile key, for example `rb_sports`.
- Attached local MP4 recognized.
- Caption and hashtags prepared.
- Upload/caption staged when TikTok allows it.
- `clicksFinalPost=false`.
- Package status and dry-run result recorded.

If result is `TIKTOK_LOGIN_REQUIRED`, stop. Do not treat it as an asset or caption failure.

## Rollout Checklist: Matt / Arena

- Confirm Matt can access production RBHQ.
- Confirm Matt sees only assigned lanes and can open `Daily Plan`, `Queue`, and `Sources`.
- Review Arena candidates by score, urgency, viral signals, and caption fit.
- Verify Clip Prep reads as `ready` or clearly `metadata_only`.
- Confirm no one runs TikTok staging until the correct local profile session passes session check.
- Confirm Matt knows `TIKTOK_LOGIN_REQUIRED` means stop and escalate.

## Rollout Checklist: Admin

- Confirm production is Ready before operator use.
- Confirm RSS ingestion is producing source candidates.
- Confirm Daily Plan and Queue show viral signals, why-now, captions, hashtags, Clip Prep, and package/asset states.
- Confirm Mac mini env vars are set for package and asset commands.
- Confirm `MAC_MINI_ASSET_ROOT` exists and operators can write reviewed MP4s there.
- Confirm dry-run worker records package results without final Post clicks.
- Confirm TikTok login cooldown remains tracked as the only hard rollout blocker.

## Quick Safety Verification

Run before rollout handoff:

```bash
npx tsc --noEmit
npm run build
npm run smoke:operator-queue-readiness
npm run smoke:mac-mini-dry-run-worker
```

These checks do not require TikTok login and do not upload, post, call Metricool, call n8n, or click final Post.
