#!/bin/bash
set -eo pipefail

CHANNEL=$1
CONFIG_FILE="config/sources.json"

if [ -z "$CHANNEL" ]; then
  echo "ERROR: channel is required" >&2
  echo "Usage: ./scripts/auto_select.sh <runnitbacksports>" >&2
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

case "$CHANNEL" in
  runnitbacksports) OPERATOR="operator" ;;
  *)
    echo "ERROR: unsupported channel: $CHANNEL" >&2
    exit 1
    ;;
esac

TMP_FILE=$(mktemp)

jq -r --arg channel "$CHANNEL" '.[$channel][]' "$CONFIG_FILE" | while IFS= read -r URL; do
  yt-dlp \
    --flat-playlist \
    --playlist-end 10 \
    --quiet \
    --no-warnings \
    --print "%(title)s|%(url)s" \
    "$URL" 2>/dev/null || true
done > "$TMP_FILE"

CHANNEL_NAME="$CHANNEL" awk -F"|" '
function score(title, channel) {
  s=0
  t=tolower(title)

  if (channel == "runnitbacksports") {
    if (t ~ /interview|micd up|locker room|press conference|highlights/) s+=4
    if (t ~ /nfl|nba|game winner|clutch|viral/) s+=5
  }

  return s
}

{
  s = score($1, ENVIRON["CHANNEL_NAME"])
  print s "|" $0
}
' "$TMP_FILE" | sort -nr > "$TMP_FILE.sorted"

echo "=== TOP PICKS: $CHANNEL ==="
head -n 5 "$TMP_FILE.sorted"

BEST=$(head -n 1 "$TMP_FILE.sorted")
TITLE=$(echo "$BEST" | cut -d"|" -f2)
URL=$(echo "$BEST" | cut -d"|" -f3)

echo ""
echo "TITLE: $TITLE"
echo "URL: $URL"
echo ""
echo "=== READY FOR PIPELINE ==="
echo "./scripts/run_pipeline.sh \"$URL\" 0:03 0:12 auto_${CHANNEL}_001 tiktok ${OPERATOR} ${CHANNEL}"

rm -f "$TMP_FILE" "$TMP_FILE.sorted"
