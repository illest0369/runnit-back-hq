# Mac mini n8n Dry-Run Setup

This is the first receiver-only setup for RBHQ approved clip handoffs.

Do not add live TikTok, Instagram, YouTube, or other social posting in this phase. Keep `N8N_TEST_MODE=true`. n8n receipt means the automation workflow received the payload; it does not mean the clip was posted anywhere.

## 1. Start n8n With Docker

On the Mac mini:

```bash
docker volume create n8n_data

docker run -d \
  --name n8n-rbhq \
  --restart unless-stopped \
  -p 5678:5678 \
  -e RBHQ_N8N_WEBHOOK_SECRET='replace-with-long-random-secret' \
  -v n8n_data:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
```

Open n8n:

```text
http://localhost:5678
```

Useful container commands:

```bash
docker logs -f n8n-rbhq
docker stop n8n-rbhq
docker start n8n-rbhq
docker rm n8n-rbhq
```

## 2. Create The n8n Workflow

Workflow name:

```text
RBHQ Dry Run Receiver
```

Workflow shape:

```text
Webhook -> Code -> Respond to Webhook
```

### Webhook Node

Set:

- HTTP Method: `POST`
- Path: `rbhq-publish`
- Authentication: `None`
- Respond: `Using Respond to Webhook Node`

### Code Node

Paste this code:

```javascript
const headers = $json.headers || {};
const body = $json.body || {};

const receivedSecret =
  headers['x-rbhq-n8n-secret'] ||
  headers['X-RBHQ-N8N-Secret'];

const expectedSecret = $env.RBHQ_N8N_WEBHOOK_SECRET;

if (!expectedSecret) {
  throw new Error('RBHQ_N8N_WEBHOOK_SECRET is not configured in n8n');
}

if (receivedSecret !== expectedSecret) {
  throw new Error('Invalid RBHQ n8n shared secret');
}

console.log('RBHQ payload received by n8n', {
  postId: body.postId,
  clipId: body.clipId,
  channelId: body.channelId,
  publishAction: body.publishAction,
  testMode: body.testMode,
  mediaUrl: body.media?.url || null,
});

return [
  {
    json: {
      ok: true,
      status: 'automation_queued',
      provider: 'n8n',
      dryRun: true,
      message: 'RBHQ payload received by n8n',
      received: {
        postId: body.postId,
        clipId: body.clipId,
        channelId: body.channelId,
        publishAction: body.publishAction,
        testMode: body.testMode,
      },
    },
  },
];
```

### Respond To Webhook Node

Set:

- Respond With: `JSON`
- Response Code: `200`
- Response Body:

```json
{
  "ok": true,
  "status": "automation_queued",
  "provider": "n8n",
  "dryRun": true,
  "message": "RBHQ payload received by n8n"
}
```

## 3. Webhook URLs

For the first test while the Webhook node is listening:

```text
http://localhost:5678/webhook-test/rbhq-publish
```

For repeat dry-run testing after activating the workflow:

```text
http://localhost:5678/webhook/rbhq-publish
```

Use the production webhook URL for repeated RBHQ dry-run testing:

```text
http://localhost:5678/webhook/rbhq-publish
```

## 4. RBHQ `.env.local`

In `/Users/malyhernandez/Dev/rbhq/.env.local`, set:

```bash
PUBLISH_PROVIDER=n8n
N8N_WEBHOOK_URL=http://localhost:5678/webhook/rbhq-publish
N8N_WEBHOOK_SECRET=replace-with-long-random-secret
N8N_TEST_MODE=true
N8N_TIMEOUT_MS=10000
```

`N8N_WEBHOOK_SECRET` in RBHQ must exactly match `RBHQ_N8N_WEBHOOK_SECRET` in the n8n Docker container.

## 5. Verify From RBHQ

```bash
cd /Users/malyhernandez/Dev/rbhq
npm run n8n:probe
npm run smoke:n8n-export
npm run n8n:probe -- --send-test
```

`npm run n8n:probe -- --send-test` sends a dry-run payload only. Keep `N8N_TEST_MODE=true`.

## 6. Admin UI Dry-Run Test

Start RBHQ:

```bash
cd /Users/malyhernandez/Dev/rbhq
npm run dev
```

Then:

1. Log in as admin.
2. Go to the Metricool/export handoff page.
3. Confirm the provider shows `n8n`.
4. Confirm n8n is configured.
5. Send one approved/export-ready clip to n8n.
6. Confirm n8n receives the payload.
7. Confirm RBHQ records handoff/automation status only.
8. Confirm RBHQ does not mark the clip as `published`, `metricool_published`, or `manually_published`.

## 7. Expected Failure Checks

- Wrong secret should fail in the n8n Code node.
- Stopped n8n should return a safe RBHQ failure.
- Missing `N8N_WEBHOOK_URL` should return `n8n_not_configured`.
- Test mode should not post live.
- n8n success only means `automation_queued`, not social posted.

This phase is receiver-only. Live social posting is a later phase.
