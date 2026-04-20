#!/bin/bash
set -eo pipefail

INPUT=$1
START=$2
END=$3
POST_ID=$4
PLATFORM=$5
OPERATOR=$6
CHANNEL=$7
SOURCE_PRIORITY=${8:-medium}
TITLE=${9:-$POST_ID}
TRANSCRIPT_SCORE=${10:-0}
DUPLICATE_FLAG=${11:-false}

if [ -z "$OPERATOR" ]; then
  echo "ERROR: operator (arg 6) is required" >&2
  exit 1
fi

if [ -z "$CHANNEL" ]; then
  echo "ERROR: channel (arg 7) is required" >&2
  exit 1
fi

case "$CHANNEL" in
  sports|arena|women|combat) ;;
  *)
    echo "ERROR: unknown channel: $CHANNEL" >&2
    exit 1
    ;;
esac

# normalize timestamps to HH:MM:SS
normalize() {
  local raw="$1"
  local a b c

  IFS=':' read -r a b c <<< "$raw"

  if [ -n "$c" ]; then
    printf "%02d:%02d:%02d" "$((10#$a))" "$((10#$b))" "$((10#$c))"
  elif [ -n "$b" ]; then
    printf "00:%02d:%02d" "$((10#$a))" "$((10#$b))"
  else
    printf "00:00:%02d" "$((10#$a))"
  fi
}

START_N=$(normalize "$START")
END_N=$(normalize "$END")
to_seconds() {
  local raw="$1"
  local hh mm ss
  IFS=':' read -r hh mm ss <<< "$raw"
  echo $((10#$hh * 3600 + 10#$mm * 60 + 10#$ss))
}

DURATION=$(( $(to_seconds "$END_N") - $(to_seconds "$START_N") ))
TIMESTAMP=$(date +%s)
OUT="outputs/${POST_ID}_${PLATFORM}_${TIMESTAMP}.mp4"
TRACK_JSON="outputs/${POST_ID}_${PLATFORM}_${TIMESTAMP}_track.json"
TRACKED_OUT="outputs/${POST_ID}_${PLATFORM}_${TIMESTAMP}_tracked.mp4"

echo "START_N=$START_N"
echo "END_N=$END_N"

echo "=== TRIM ==="
./scripts/trim_clip.sh "$INPUT" "$START_N" "$END_N" "$OUT"

if [ ! -f "$OUT" ]; then
  echo "ERROR: Trim failed"
  exit 1
fi

echo "=== TRACKING ==="
if ! python3 scripts/elite_track.py "$OUT" "$TRACK_JSON"; then
  rm -f "$OUT" "$TRACK_JSON"
  echo "ERROR: Tracking failed"
  exit 1
fi

if [ ! -f "$TRACK_JSON" ]; then
  rm -f "$OUT" "$TRACK_JSON"
  echo "ERROR: Tracking failed"
  exit 1
fi

echo "=== RENDERING ==="
if ! python3 scripts/render_tracked.py "$OUT" "$TRACK_JSON" "$TRACKED_OUT"; then
  rm -f "$OUT" "$TRACK_JSON" "$TRACKED_OUT"
  echo "ERROR: Render failed"
  exit 1
fi

if [ ! -f "$TRACKED_OUT" ]; then
  rm -f "$OUT" "$TRACK_JSON" "$TRACKED_OUT"
  echo "ERROR: Render failed"
  exit 1
fi

echo "=== UPLOADING ==="
if ! UPLOAD_OUTPUT=$(./scripts/upload_to_r2.sh "$TRACKED_OUT" "$OPERATOR" "$CHANNEL" 2>&1); then
  echo "$UPLOAD_OUTPUT" >&2
  rm -f "$OUT" "$TRACK_JSON" "$TRACKED_OUT"
  echo "ERROR: Upload failed"
  exit 1
fi

CDN_URL=$(echo "$UPLOAD_OUTPUT" | grep '^R2_URL=' | cut -d'=' -f2-)
if [ -z "$CDN_URL" ]; then
  rm -f "$OUT" "$TRACK_JSON" "$TRACKED_OUT"
  echo "ERROR: Upload failed"
  exit 1
fi

echo "=== SCORING ==="
SCORE_JSON=$(./scripts/score_candidate.sh "$POST_ID" "$CHANNEL" "$SOURCE_PRIORITY" "$TITLE" "$TRANSCRIPT_SCORE" "$DURATION" "$DUPLICATE_FLAG")
echo "$SCORE_JSON"

SCORE=$(echo "$SCORE_JSON" | jq -r '.score')
DECISION=$(echo "$SCORE_JSON" | jq -r '.decision')
REASONS=$(echo "$SCORE_JSON" | jq -c '.reasons')

echo "=== METADATA ==="
META_OUTPUT=$(./scripts/write_metadata.sh "$POST_ID" "$PLATFORM" "$INPUT" "$START_N" "$END_N" "$TRACKED_OUT" "$CDN_URL" "$CHANNEL" "$OPERATOR" "$SCORE" "$DECISION" "$REASONS")
echo "$META_OUTPUT"

rm -f "$OUT" "$TRACK_JSON"

if [ "$DECISION" = "reject" ]; then
  echo "=== SCORE GATE ==="
  echo "REJECTED_BY_SCORE=$POST_ID"
  echo "OUTPUT_FILE=$TRACKED_OUT"
  echo "$UPLOAD_OUTPUT"
  exit 0
fi

echo "=== QUEUE POST ==="
CAPTION="${TITLE} | ${CHANNEL}"
./scripts/queue_post.sh "$CDN_URL" "$CAPTION" "$CHANNEL" "$POST_ID" "$SCORE" "$DECISION" "$REASONS"

echo "OUTPUT_FILE=$TRACKED_OUT"
echo "$UPLOAD_OUTPUT"
