#!/bin/bash
set -e

VIDEO_FILE=$1
CAPTION=$2
CHANNEL=$3

if [ -z "$VIDEO_FILE" ] || [ -z "$CHANNEL" ]; then
  echo "ERROR: Usage: post_to_telegram.sh <video_file> <caption> <channel>"
  exit 1
fi

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "SKIP: TELEGRAM_BOT_TOKEN not set"
  exit 0
fi

# Map channel to Telegram chat ID
case "$CHANNEL" in
  sports) CHAT_ID="$TG_CHAT_SPORTS" ;;
  arena)  CHAT_ID="$TG_CHAT_ARENA"  ;;
  women)  CHAT_ID="$TG_CHAT_WOMEN"  ;;
  *)
    echo "ERROR: Unknown channel: $CHANNEL"
    exit 1
    ;;
esac

if [ -z "$CHAT_ID" ]; then
  echo "SKIP: No Telegram chat ID for $CHANNEL"
  exit 0
fi

RESPONSE=$(curl -s -X POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo" \
  -F "chat_id=$CHAT_ID" \
  -F "video=@$VIDEO_FILE" \
  -F "caption=$CAPTION" \
  -F "parse_mode=HTML")

OK=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok','false'))" 2>/dev/null || echo "false")

if [ "$OK" = "True" ]; then
  echo "TELEGRAM_OK=$CHANNEL"
else
  echo "TELEGRAM_FAIL=$CHANNEL"
  echo "$RESPONSE" >&2
fi
