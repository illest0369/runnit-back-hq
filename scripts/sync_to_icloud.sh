#!/bin/bash
set -e

VIDEO_FILE=$1
CHANNEL=$2
POST_ID=$3

if [ -z "$VIDEO_FILE" ] || [ -z "$CHANNEL" ]; then
  echo "ERROR: Usage: sync_to_icloud.sh <video_file> <channel> <post_id>"
  exit 1
fi

ICLOUD_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/RunnitClips/${CHANNEL}"
mkdir -p "$ICLOUD_DIR"

FILENAME="${POST_ID}_$(date +%s).mp4"
cp "$VIDEO_FILE" "${ICLOUD_DIR}/${FILENAME}"

echo "ICLOUD_SYNCED=${ICLOUD_DIR}/${FILENAME}"
