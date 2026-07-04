# RBHQ n8n Publishing Bridge

RBHQ now supports an optional Mac mini + n8n publishing bridge.

The bridge does not replace Metricool and does not add direct live social posting inside RBHQ. RBHQ prepares approved clip payloads and hands them to n8n. The Mac mini runs n8n and owns downstream automation such as downloading media, moving files, calling platform tools, or routing to future publishing providers.

## Provider Model

Set `PUBLISH_PROVIDER` to choose the active publishing bridge:

- `manual`: default safe fallback. RBHQ keeps approved clips ready for manual export.
- `metricool`: keeps the existing Metricool routes available for future use.
- `n8n`: enables the n8n webhook bridge.

Metricool code remains in the app as an optional future provider. Manual export remains available regardless of provider.

## Required Env Vars

```bash
PUBLISH_PROVIDER=n8n
N8N_WEBHOOK_URL=https://your-n8n-host/webhook/rbhq-publish
N8N_WEBHOOK_SECRET=replace-with-shared-secret
N8N_TEST_MODE=true
N8N_TIMEOUT_MS=10000
```

`N8N_TEST_MODE=true` forces RBHQ to send `publishAction: "dry_run"` in the webhook payload. n8n should treat dry-run payloads as non-publishing validation events.

## Payload Contract

RBHQ sends approved clips to n8n with:

- `postId` and `clipId`
- `channelId`
- `title`
- `caption`
- `hashtags`
- `media.url`
- `media.path` when available
- `scheduledAt` when provided
- `publishAction`
- `requestedPublishAction`
- `testMode`

Example fixture:

```bash
docs/fixtures/n8n-webhook-payload.sample.json
```

RBHQ includes:

- `X-RBHQ-N8N-Secret` when `N8N_WEBHOOK_SECRET` is present
- `X-RBHQ-N8N-Signature`, an HMAC-SHA256 signature of the JSON body using `N8N_WEBHOOK_SECRET`
- `X-RBHQ-Bridge: n8n`

The shared secret and signature are never returned by config routes or probes.

## First Dry-Run Workflow Contract

For the first Mac mini test, keep RBHQ in n8n dry-run mode:

```bash
PUBLISH_PROVIDER=n8n
N8N_TEST_MODE=true
N8N_WEBHOOK_URL=https://your-mac-mini-n8n-host/webhook/rbhq-publish
N8N_WEBHOOK_SECRET=replace-with-shared-secret
N8N_TIMEOUT_MS=10000
```

The Mac mini runs n8n. The n8n webhook should verify `N8N_WEBHOOK_SECRET` by checking `X-RBHQ-N8N-Secret` or validating `X-RBHQ-N8N-Signature` against the raw JSON body.

For the first dry-run, n8n should return:

```json
{
  "ok": true,
  "status": "automation_queued",
  "provider": "n8n",
  "dryRun": true,
  "message": "RBHQ payload received by n8n"
}
```

RBHQ may record `automation_queued` as an automation state. RBHQ must never treat n8n receipt as live social posting. Live social posting is a later phase after the Mac mini workflow, payload validation, media access, platform credentials, and failure reporting are proven.

## Routes

Admin only:

```bash
GET /api/n8n-export/config
POST /api/n8n-export/[clipId]/send
```

The config route reports only safe booleans:

- provider
- webhook URL present
- secret present
- test mode
- timeout
- configured

Non-admin users receive `403`.

## Statuses

The bridge adds these publish lifecycle statuses:

- `ready_for_automation`
- `sent_to_n8n`
- `automation_queued`
- `automation_failed`
- `ready_for_manual_publish`

RBHQ does not mark a post as live published when it hands off to n8n. `sent_to_n8n` only means the webhook accepted the handoff.
`automation_queued` means n8n accepted the payload into its automation workflow. It still does not mean the content was posted to TikTok, Instagram, YouTube, or any other platform.

## Safe Testing

Run config-only validation:

```bash
npm run n8n:probe
```

Send a dry-run payload only when n8n is configured:

```bash
npm run n8n:probe -- --send-test
```

Run the bridge smoke test:

```bash
npm run smoke:n8n-export
```

The smoke test verifies that missing envs do not crash, non-admin users cannot read config, admin users can read safe config, and test mode does not fake live publishing.

## Mac mini / n8n Responsibilities

The Mac mini should run n8n with a workflow that:

1. Receives the RBHQ webhook.
2. Verifies `X-RBHQ-N8N-Secret` or `X-RBHQ-N8N-Signature`.
3. Rejects live actions when `testMode` is true or `publishAction` is `dry_run`.
4. Downloads or accesses the media URL/path.
5. Performs downstream automation.
6. Reports failures in n8n logs or a future RBHQ callback endpoint.

Actual social posting credentials should live in n8n or the downstream provider, not in tester accounts. RBHQ users should only approve and hand off posts.
