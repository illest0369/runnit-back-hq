const expectedResponse = {
  ok: true,
  status: 'automation_queued',
  provider: 'n8n',
  dryRun: true,
  message: 'RBHQ payload received by n8n',
}

console.log(`
RBHQ Mac mini n8n dry-run setup

Required RBHQ .env.local values:

PUBLISH_PROVIDER=n8n
N8N_WEBHOOK_URL=http://localhost:5678/webhook/rbhq-publish
N8N_WEBHOOK_SECRET=replace-with-long-random-secret
N8N_TEST_MODE=true
N8N_TIMEOUT_MS=10000

The RBHQ N8N_WEBHOOK_SECRET must exactly match the Mac mini n8n
RBHQ_N8N_WEBHOOK_SECRET container environment variable.

Expected n8n webhook URL:

http://localhost:5678/webhook/rbhq-publish

Expected n8n response JSON:

${JSON.stringify(expectedResponse, null, 2)}

Reminder:
- Keep N8N_TEST_MODE=true for the first dry-run.
- This helper does not contact n8n.
- n8n receipt means automation queued, not social posted.
- Do not add platform credentials or live posting in this phase.

Full setup doc:
docs/mac-mini-n8n-dry-run-setup.md
`.trim())

export {}
