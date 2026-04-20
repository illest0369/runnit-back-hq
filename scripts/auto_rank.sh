#!/bin/bash
set -e

PERF_FILE="data/performance.json"

if [ ! -f "$PERF_FILE" ]; then
  echo "No performance data"
  exit 1
fi

echo "=== TOP CLIPS ==="

jq -r '
  sort_by(.views + (.likes * 2) + (.shares * 3))
  | reverse
  | .[:10]
  | .[]
  | "\(.post_id) | \(.channel) | \(.operator) | score=\(.views + (.likes*2) + (.shares*3))"
' "$PERF_FILE"

echo ""
echo "=== CHANNEL PERFORMANCE ==="

jq -r '
  group_by(.channel)[]
  | {
      channel: .[0].channel,
      total: (map(.views) | add)
    }
  | "\(.channel) | total_views=\(.total)"
' "$PERF_FILE"

echo ""
echo "=== OPERATOR PERFORMANCE ==="

jq -r '
  group_by(.operator)[]
  | {
      operator: .[0].operator,
      total: (map(.views) | add)
    }
  | "\(.operator) | total_views=\(.total)"
' "$PERF_FILE"
