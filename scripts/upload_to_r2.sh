#!/bin/bash
set -e

LOCAL_FILE=$1
OPERATOR=$2
CHANNEL=$3

if [ -z "$LOCAL_FILE" ] || [ -z "$OPERATOR" ] || [ -z "$CHANNEL" ]; then
  echo "ERROR: Usage: upload_to_r2.sh <local_file> <operator> <channel>" >&2
  exit 1
fi

if [ ! -f "$LOCAL_FILE" ]; then
  echo "ERROR: File not found: $LOCAL_FILE" >&2
  exit 1
fi

if [ -z "$R2_ACCOUNT_ID" ] || [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ] || [ -z "$R2_BUCKET" ]; then
  echo "ERROR: Missing required env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET" >&2
  exit 1
fi

FILENAME=$(basename "$LOCAL_FILE")
R2_KEY="${CHANNEL}/${OPERATOR}/${FILENAME}"

AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
aws s3 cp "$LOCAL_FILE" "s3://${R2_BUCKET}/${R2_KEY}" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --region auto >&2

echo "R2_URL=https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.dev/${R2_KEY}"
