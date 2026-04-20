#!/bin/bash
set -e

VIDEO_URL=$1
CAPTION=$2
PROFILE_ID=$3

if [ -z "$VIDEO_URL" ] || [ -z "$PROFILE_ID" ]; then
  echo "ERROR: Missing args"
  exit 1
fi

RESPONSE=$(curl -s -X POST https://api.bufferapp.com/1/updates/create.json \
  -d "access_token=$BUFFER_ACCESS_TOKEN" \
  -d "profile_ids[]=$PROFILE_ID" \
  -d "text=$CAPTION" \
  -d "media[video]=$VIDEO_URL" \
  -d "scheduled_at=$(date -u -v+10M +%Y-%m-%dT%H:%M:%SZ)")

echo "$RESPONSE"
