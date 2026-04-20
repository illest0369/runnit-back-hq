#!/bin/bash
set -e

POST_ID=$1
PLATFORM=$2
INPUT=$3
START=$4
END=$5
OUTPUT_FILE=$6
CDN_URL=$7
CHANNEL=$8
OPERATOR=$9
SCORE=${10:-0}
DECISION=${11:-reject}
REASONS=${12:-[]}

TIMESTAMP=$(date +%s)
META_FILE="outputs/${POST_ID}_${PLATFORM}_${TIMESTAMP}.json"

cat <<EOF > "$META_FILE"
{
  "post_id": "$POST_ID",
  "platform": "$PLATFORM",
  "channel": "$CHANNEL",
  "operator": "$OPERATOR",
  "input_file": "$INPUT",
  "timestamp_range": "$START-$END",
  "output_file": "$OUTPUT_FILE",
  "cdn_url": "$CDN_URL",
  "status": "uploaded",
  "score": $SCORE,
  "decision": "$DECISION",
  "reasons": $REASONS
}
EOF

echo "METADATA_FILE=$META_FILE"
