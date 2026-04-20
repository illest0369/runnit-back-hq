#!/bin/bash
set -eo pipefail

VIDEO_URL=$1
CAPTION=$2
CHANNEL=$3
POST_ID=${4:-}
SCORE=${5:-0}
DECISION=${6:-approve_queue}
REASONS=${7:-[]}

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "$N8N_WEBHOOK_URL" ]; then
  echo "ERROR: N8N_WEBHOOK_URL is required" >&2
  exit 1
fi

if [ -z "$VIDEO_URL" ]; then
  echo "ERROR: VIDEO_URL is required" >&2
  exit 1
fi

if [ -z "$CHANNEL" ]; then
  echo "ERROR: CHANNEL is required" >&2
  exit 1
fi

PAYLOAD=$(python3 - "$VIDEO_URL" "$CAPTION" "$CHANNEL" "$POST_ID" "$SCORE" "$DECISION" "$REASONS" <<'PY'
import json
import sys

payload = {
    "video_url": sys.argv[1],
    "caption": sys.argv[2],
    "channel": sys.argv[3],
    "status": "pending_approval",
    "post_id": sys.argv[4],
    "score": int(sys.argv[5]),
    "decision": sys.argv[6],
    "reasons": json.loads(sys.argv[7]),
}

print(json.dumps(payload))
PY
)

HTTP_CODE=$(curl -sS -o /tmp/runnit_n8n_response.$$ -w "%{http_code}" \
  -X POST "$N8N_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
  cat /tmp/runnit_n8n_response.$$ >&2 || true
  rm -f /tmp/runnit_n8n_response.$$
  echo "ERROR: n8n webhook failed with status $HTTP_CODE" >&2
  exit 1
fi

rm -f /tmp/runnit_n8n_response.$$
echo "N8N_TRIGGERED"
