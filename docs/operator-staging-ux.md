# Operator Staging UX

RBHQ operator staging keeps TikTok browser work on the local Mac mini. The web UI records a staging request for an approved, prepared package; the local worker consumes requested packages and runs the existing TikTok web-upload dry-run.

## Operator flow

1. Approve or open an approved Intelligence V1 candidate in the operator queue.
2. Refresh Clip Prep until the queue shows `Clip Prep ready`.
3. Create the Mac mini package.
4. Attach the local rendered MP4 to the package on the Mac mini.
5. Click `Stage` in the operator UI. This records `tiktok_staging_status=requested`.
6. On the Mac mini, run:

```bash
npm run handoff:mac-mini:run-dry-run -- --stage-upload
```

For the configured CDP Chrome session, run with the existing CDP flags or environment:

```bash
npm run handoff:mac-mini:run-dry-run -- --stage-upload --browser cdp --launch-cdp-chrome
```

The worker opens/uses the configured persistent browser session, uploads the attached MP4, fills the caption, captures artifacts when available, and stops before final Post.

## Safety

- The TikTok final Post button is never clicked by RBHQ automation.
- Staging records `Ready for manual Post`, not `Published`.
- Staging does not call TikTok publishing APIs.
- Staging does not call Metricool or n8n.
- Staging does not mark a clip or package as published.
- RBHQ does not store TikTok credentials.
- Operator UI shows staging state and blockers, but does not expose local browser profile paths or session cookie values.
