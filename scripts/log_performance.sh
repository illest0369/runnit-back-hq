#!/bin/bash
set -e

META_FILE=$1
PERF_FILE="data/performance.json"

if [ ! -f "$META_FILE" ]; then
  echo "ERROR: Metadata file not found"
  exit 1
fi

if [ ! -f "$PERF_FILE" ]; then
  echo "[]" > "$PERF_FILE"
fi

POST_ID=$(jq -r '.post_id' "$META_FILE")
CHANNEL=$(jq -r '.channel' "$META_FILE")
OPERATOR=$(jq -r '.operator' "$META_FILE")
CDN_URL=$(jq -r '.cdn_url' "$META_FILE")

TIMESTAMP=$(date +%s)

NEW_ENTRY=$(jq -n \
  --arg post_id "$POST_ID" \
  --arg channel "$CHANNEL" \
  --arg operator "$OPERATOR" \
  --arg url "$CDN_URL" \
  --arg ts "$TIMESTAMP" \
  '{
    post_id: $post_id,
    channel: $channel,
    operator: $operator,
    cdn_url: $url,
    created_at: ($ts | tonumber),
    views: 0,
    likes: 0,
    shares: 0,
    comments: 0
  }')

# Check if post_id already exists
EXISTS=$(jq --arg id "$POST_ID" 'map(select(.post_id == $id)) | length' "$PERF_FILE")

if [ "$EXISTS" -gt 0 ]; then
  echo "SKIP_DUPLICATE=$POST_ID"
  exit 0
fi

TMP=$(mktemp)
jq --argjson entry "$NEW_ENTRY" '. += [$entry]' "$PERF_FILE" > "$TMP"
mv "$TMP" "$PERF_FILE"

echo "PERF_LOGGED=$POST_ID"
