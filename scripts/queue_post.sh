#!/bin/bash
set -eo pipefail

VIDEO_URL=$1
CAPTION=$2
CHANNEL=$3
POST_ID=${4:-}
SCORE=${5:-0}
DECISION=${6:-approve_queue}
REASONS=${7:-[]}
SOURCE_VIDEO_URL=${8:-}
OPERATOR=${9:-}
THUMBNAIL_URL=${10:-}

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

is_playable_asset_url() {
  local url_lc
  url_lc=$(printf "%s" "$1" | tr '[:upper:]' '[:lower:]')

  case "$url_lc" in
    *youtube.com/watch*|*youtu.be/*|*tiktok.com/*|*instagram.com/*|*twitter.com/*|*x.com/*) return 1 ;;
  esac

  case "$url_lc" in
    blob:*|*.mp4|*.mp4\?*|*.webm|*.webm\?*|*.mov|*.mov\?*|*.m3u8|*.m3u8\?*|*r2.dev/*|*cloudflare*|*cdn*) return 0 ;;
  esac

  return 1
}

if ! is_playable_asset_url "$VIDEO_URL"; then
  echo "ERROR: VIDEO_URL must be a playable uploaded asset, got unsupported page URL: $VIDEO_URL" >&2
  exit 1
fi

PAYLOAD=$(python3 - "$VIDEO_URL" "$CAPTION" "$CHANNEL" "$POST_ID" "$SCORE" "$DECISION" "$REASONS" "$SOURCE_VIDEO_URL" "$OPERATOR" "$THUMBNAIL_URL" <<'PY'
import json
import sys

asset_url = sys.argv[1]
source_url = sys.argv[8]
operator = sys.argv[9]
thumbnail_url = sys.argv[10]

payload = {
    "video_url": asset_url,
    "cdn_url": asset_url,
    "rendered_video_url": asset_url,
    "processed_video_url": asset_url,
    "source_video_url": source_url,
    "thumbnail_url": thumbnail_url or None,
    "caption": sys.argv[2],
    "channel": sys.argv[3],
    "operator": operator,
    "status": "pending_approval",
    "post_id": sys.argv[4],
    "score": int(sys.argv[5]),
    "decision": sys.argv[6],
    "reasons": json.loads(sys.argv[7]),
}

print(json.dumps(payload))
PY
)

echo "PIPELINE MEDIA DEBUG: $PAYLOAD" >&2

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
