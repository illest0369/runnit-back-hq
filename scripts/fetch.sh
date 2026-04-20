#!/bin/bash
set -eo pipefail

CHANNEL=$1
CONFIG_FILE="config/sources.json"

if [ -z "$CHANNEL" ]; then
  echo "ERROR: channel is required" >&2
  echo "Usage: ./scripts/fetch.sh <sports|arena|women|combat>" >&2
  exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: missing $CONFIG_FILE" >&2
  exit 1
fi

./scripts/validate_sources.sh >/dev/null

if ! jq -e --arg channel "$CHANNEL" 'has($channel)' "$CONFIG_FILE" >/dev/null; then
  echo "ERROR: unknown channel: $CHANNEL" >&2
  exit 1
fi

echo "=== RUNNIT BACK FETCH: $CHANNEL ==="

jq -r --arg channel "$CHANNEL" '.[$channel][]' "$CONFIG_FILE" | while IFS= read -r URL; do
  echo ""
  echo "[$CHANNEL] $URL"

  yt-dlp \
    --flat-playlist \
    --playlist-end 10 \
    --print "%(title)s | %(url)s" \
    "$URL"
done
