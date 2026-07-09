# Mac mini Manual Asset QA

This flow lets a Mac mini operator inspect approved RBHQ clip packages, attach a local MP4, run the TikTok browser uploader in dry-run mode, and record or review status. It does not download video, call Metricool, schedule posts, click TikTok Post, or publish live.

## Required env vars

Run these on the Mac mini shell before using the package scripts:

```bash
export RBHQ_BASE_URL="https://<rbhq-app-host>"
export MAC_MINI_WORKER_TOKEN="<worker-token-configured-in-rbhq>"
export MAC_MINI_ASSET_ROOT="/Users/<operator>/rbhq-assets"
```

`MAC_MINI_API_BASE_URL` can be used instead of `RBHQ_BASE_URL` when the worker should call a different API origin. `MAC_MINI_ASSET_ROOT` is the only allowed root for MP4 paths attached to packages.

## 1. List Pending Packages

```bash
npm run handoff:mac-mini:fetch -- --limit 10
```

Pick a package `id` from the JSON output. The package must remain dry-run only and should include `publishAction: "dry_run"` plus safety flags forbidding live posting and final Post clicks.

## 2. Show Package Details

```bash
npm run handoff:mac-mini:show -- --package-id <package_id>
```

Review `laneLabel`, `browserChannelKey`, `sourceUrl`, `sourceTitle`, `caption`, `hashtags`, `whyNow`, `hook`, `operatorSummary`, `editNotes`, `packageStatus`, `handoffStatus`, `assetStatus`, and any previous `dryRunError`.

## 3. Place The MP4 Manually

Create the allowed asset directory and place a reviewed MP4 under it:

```bash
mkdir -p "$MAC_MINI_ASSET_ROOT"
cp /path/to/manual-render.mp4 "$MAC_MINI_ASSET_ROOT/<package_id>.mp4"
```

The repo does not include an automated video downloader for this workflow. The asset must already exist locally, must be an `.mp4`, and must be inside `MAC_MINI_ASSET_ROOT`.

## 4. Attach The Local MP4

```bash
npm run handoff:mac-mini:attach-asset -- \
  --package-id <package_id> \
  --asset-path "$MAC_MINI_ASSET_ROOT/<package_id>.mp4"
```

Verify attachment:

```bash
npm run handoff:mac-mini:show -- --package-id <package_id>
```

Expected asset fields after a valid attach:

```json
{
  "assetStatus": "attached",
  "localAssetPath": "/Users/<operator>/rbhq-assets/<package_id>.mp4",
  "assetError": null
}
```

## 5. Run The Browser Dry Run

Metadata-only dry run:

```bash
npm run handoff:mac-mini:run-dry-run -- --limit 1
```

Dry run with the attached MP4 staged where the browser uploader allows it:

```bash
npm run handoff:mac-mini:run-dry-run -- --limit 1 --stage-upload
```

The worker resolves the package lane to the existing TikTok browser profile key, prepares the caption and hashtags where safe, and stops before final Post. If no attached MP4 exists, the worker records an `asset_missing` dry-run result instead of trying to download media.

Useful optional flags:

```bash
npm run handoff:mac-mini:run-dry-run -- --limit 1 --headless
npm run handoff:mac-mini:run-dry-run -- --limit 1 --timeout-ms 90000
npm run handoff:mac-mini:run-dry-run -- --limit 1 --artifact-dir ./tmp/mac-mini-dry-run-packages
```

## 6. Show Dry-Run Result

```bash
npm run handoff:mac-mini:show -- --package-id <package_id>
```

Review `packageStatus`, `handoffStatus`, `workerId`, `fetchedAt`, `dryRunAt`, and `dryRunError`. Success should move the package to `dry_run_complete` / `dry_run_succeeded`. Failure should keep the error visible for operator follow-up.

If the browser dry run was completed manually outside the worker, record the result without publishing:

```bash
npm run handoff:mac-mini:dry-run -- --package-id <package_id> --success
```

or:

```bash
npm run handoff:mac-mini:dry-run -- \
  --package-id <package_id> \
  --failure \
  --error "Manual dry-run failed before publish step."
```

## Safety Boundaries

- No live TikTok publish is implemented in this flow.
- No final Post click is allowed.
- No Metricool, n8n, scheduler, cron, Queue API, or live publish behavior is added.
- No automated video downloading is included.
- TikTok credentials stay in the local browser profile on the Mac mini.
- Operators use package metadata and local MP4 files only.
