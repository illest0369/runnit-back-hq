#!/bin/bash
set -eo pipefail

QUEUE_FILE="queue.json"
LOG_FILE="logs/queue_$(date +%s).log"

mkdir -p logs temp

echo "=== QUEUE START ===" | tee -a "$LOG_FILE"

while IFS= read -r job <&3; do

  URL=$(echo "$job" | jq -r '.url')
  START=$(echo "$job" | jq -r '.start')
  END=$(echo "$job" | jq -r '.end')
  POST_ID=$(echo "$job" | jq -r '.post_id')
  PLATFORM=$(echo "$job" | jq -r '.platform')
  CHANNEL=$(echo "$job" | jq -r '.channel')

  if [ -z "$CHANNEL" ]; then
    echo "[FAIL] Missing channel" | tee -a "$LOG_FILE"
    continue
  fi

  case "$CHANNEL" in
    sports) OPERATOR="manny" ;;
    arena)  OPERATOR="matt"  ;;
    women)  OPERATOR="maly"  ;;
    combat) OPERATOR="agent" ;;
    *)
      echo "[FAIL] Unknown channel: $CHANNEL" | tee -a "$LOG_FILE"
      continue
      ;;
  esac

  JOB_ID="${POST_ID}_$(date +%s)"
  INPUT_FILE="temp/${JOB_ID}.webm"

  echo "=== JOB: $JOB_ID ===" | tee -a "$LOG_FILE"

  set +e
  DEDUP_RESULT=$(python3 ./scripts/dedup_video.py check "$CHANNEL" "$URL" 2>>"$LOG_FILE")
  DEDUP_CODE=$?
  set -e

  if [ "$DEDUP_CODE" -eq 10 ]; then
    echo "DUPLICATE_SKIPPED: $POST_ID" | tee -a "$LOG_FILE"
    continue
  fi

  if [ "$DEDUP_CODE" -eq 11 ]; then
    echo "CROSS_CHANNEL_BLOCKED: $POST_ID" | tee -a "$LOG_FILE"
    echo "DUPLICATE_CROSS_CHANNEL_BLOCKED" | tee -a "$LOG_FILE"
    continue
  fi

  if [ "$DEDUP_CODE" -ne 0 ]; then
    echo "[FAIL] Dedup check failed: $JOB_ID" | tee -a "$LOG_FILE"
    continue
  fi

  # -------------------------
  # DOWNLOAD
  # -------------------------
  if ! yt-dlp -o "$INPUT_FILE" "$URL" >> "$LOG_FILE" 2>&1; then
    echo "[FAIL] Download failed: $JOB_ID" | tee -a "$LOG_FILE"
    continue
  fi

  # -------------------------
  # PIPELINE
  # -------------------------
  if ! ./scripts/run_pipeline.sh "$INPUT_FILE" "$START" "$END" "$POST_ID" "$PLATFORM" "$OPERATOR" "$CHANNEL" >> "$LOG_FILE" 2>&1; then
    echo "[FAIL] Pipeline failed: $JOB_ID" | tee -a "$LOG_FILE"
    rm -f "$INPUT_FILE"
    continue
  fi

  # -------------------------
  # CLEANUP
  # -------------------------
  rm -f "$INPUT_FILE"

  python3 ./scripts/dedup_video.py mark "$CHANNEL" "$URL" >> "$LOG_FILE" 2>&1
  echo "NEW_VIDEO_PROCESSED: $POST_ID" | tee -a "$LOG_FILE"

  echo "[SUCCESS] $JOB_ID" | tee -a "$LOG_FILE"

done 3< <(jq -c '.[]' "$QUEUE_FILE")

echo "=== QUEUE END ===" | tee -a "$LOG_FILE"
