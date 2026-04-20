#!/bin/bash
set -eo pipefail

# Usage: ./scripts/process_queue.sh queue/my_batch.json
# Or:    ./scripts/process_queue.sh   (processes all .json files in queue/)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

source "$ROOT/.env" 2>/dev/null || true

if [ -z "$R2_ACCOUNT_ID" ]; then
  echo "ERROR: .env not loaded or missing R2 vars" >&2
  exit 1
fi

LOG_DIR="$ROOT/logs"
TEMP_DIR="$ROOT/temp"
QUEUE_DIR="$ROOT/queue"

mkdir -p "$LOG_DIR" "$TEMP_DIR"

# Determine which queue files to process
if [ -n "$1" ]; then
  QUEUE_FILES="$1"
else
  QUEUE_FILES=$(ls "$QUEUE_DIR"/*.json 2>/dev/null || true)
fi

if [ -z "$QUEUE_FILES" ]; then
  echo "No queue files found."
  exit 0
fi

for QUEUE_FILE in $QUEUE_FILES; do
  echo "=== Processing queue: $QUEUE_FILE ==="
  BATCH_NAME=$(basename "$QUEUE_FILE" .json)
  LOG_FILE="$LOG_DIR/${BATCH_NAME}_$(date +%s).log"

  COUNT=$(python3 -c "import json,sys; print(len(json.load(open('$QUEUE_FILE'))))")
  echo "  $COUNT clips found"

  python3 - <<'PYEOF' "$QUEUE_FILE" "$ROOT" "$TEMP_DIR" "$LOG_FILE"
import json, subprocess, sys, os, time
from pathlib import Path

queue_file, root, temp_dir, log_file = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
clips = json.load(open(queue_file))

results = []

for i, clip in enumerate(clips):
    url       = clip["url"]
    start     = clip["start"]
    end       = clip["end"]
    post_id   = clip["post_id"]
    platform  = clip["platform"]
    channel   = clip.get("channel", "")

    if not channel:
        print(f"  ERROR: Missing channel for {post_id}")
        results.append({"post_id": post_id, "status": "error", "stage": "validation", "detail": "missing channel"})
        continue

    operators = {
        "sports": "manny",
        "arena": "matt",
        "women": "maly",
        "combat": "agent",
    }

    operator = operators.get(channel)

    if not operator:
        print(f"  ERROR: Unknown channel for {post_id}: {channel}")
        results.append({"post_id": post_id, "status": "error", "stage": "validation", "detail": f"unknown channel: {channel}"})
        continue

    print(f"\n--- [{i+1}/{len(clips)}] {post_id} | {platform} | {operator} ---")

    dedup_result = subprocess.run(
        ["python3", os.path.join(root, "scripts", "dedup_video.py"), "check", channel, url],
        capture_output=True, text=True, cwd=root
    )

    if dedup_result.returncode == 10:
        print(f"  DUPLICATE_SKIPPED: {post_id}")
        results.append({"post_id": post_id, "channel": channel, "status": "skipped", "stage": "dedup", "detail": "DUPLICATE_SKIPPED"})
        continue

    if dedup_result.returncode == 11:
        print(f"  CROSS_CHANNEL_BLOCKED: {post_id}")
        print("  DUPLICATE_CROSS_CHANNEL_BLOCKED")
        results.append({"post_id": post_id, "channel": channel, "status": "blocked", "stage": "dedup", "detail": "CROSS_CHANNEL_BLOCKED"})
        continue

    if dedup_result.returncode != 0:
        print(f"  ERROR: dedup check failed for {post_id}")
        results.append({"post_id": post_id, "channel": channel, "status": "error", "stage": "dedup", "detail": "dedup check failed"})
        continue

    # Download
    temp_file = os.path.join(temp_dir, f"{post_id}.mp4")
    print(f"  Downloading {url} ...")
    dl_result = subprocess.run(
        [
            "yt-dlp",
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--merge-output-format", "mp4",
            "-o", temp_file,
            "--no-playlist",
            url
        ],
        capture_output=True, text=True
    )

    if dl_result.returncode != 0:
        msg = f"FAIL download: {post_id} — {dl_result.stderr.strip()[-200:]}"
        print(f"  ERROR: {msg}")
        results.append({"post_id": post_id, "status": "error", "stage": "download", "detail": msg})
        continue

    # Run pipeline
    print(f"  Running pipeline ...")
    env = os.environ.copy()
    pipe_result = subprocess.run(
        [
            "bash",
            os.path.join(root, "scripts", "run_pipeline.sh"),
            temp_file, start, end, post_id, platform, operator, channel
        ],
        capture_output=True, text=True, cwd=root, env=env
    )

    # Cleanup temp download
    try:
        os.remove(temp_file)
    except FileNotFoundError:
        pass

    output = pipe_result.stdout + pipe_result.stderr

    if pipe_result.returncode != 0:
        msg = f"FAIL pipeline: {post_id}"
        print(f"  ERROR: {msg}")
        print(output[-400:])
        results.append({"post_id": post_id, "status": "error", "stage": "pipeline", "detail": output[-400:]})
        continue

    # Extract CDN URL
    cdn_url = ""
    for line in output.splitlines():
        if line.startswith("R2_URL="):
            cdn_url = line[7:]

    print(f"  OK — {cdn_url}")
    subprocess.run(
        ["python3", os.path.join(root, "scripts", "dedup_video.py"), "mark", channel, url],
        capture_output=True, text=True, cwd=root
    )
    print(f"  NEW_VIDEO_PROCESSED: {post_id}")
    results.append({"post_id": post_id, "platform": platform, "operator": operator,
                    "channel": channel, "status": "ok", "cdn_url": cdn_url})

# Write log
with open(log_file, "w") as f:
    json.dump(results, f, indent=2)

# Summary
ok  = sum(1 for r in results if r["status"] == "ok")
err = sum(1 for r in results if r["status"] == "error")
print(f"\n=== DONE: {ok} ok, {err} errors — log: {log_file} ===")
if err:
    sys.exit(1)
PYEOF

  # Move processed queue file to logs
  mv "$QUEUE_FILE" "$LOG_DIR/${BATCH_NAME}_done.json"
done
