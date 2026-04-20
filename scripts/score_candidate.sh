#!/bin/bash
set -eo pipefail

POST_ID=$1
CHANNEL=$2
SOURCE_PRIORITY=$3
TITLE=$4
TRANSCRIPT_SCORE=$5
DURATION=$6
DUPLICATE_FLAG=$7

if [ -z "$POST_ID" ] || [ -z "$CHANNEL" ] || [ -z "$SOURCE_PRIORITY" ] || [ -z "$TITLE" ] || [ -z "$TRANSCRIPT_SCORE" ] || [ -z "$DURATION" ] || [ -z "$DUPLICATE_FLAG" ]; then
  echo "ERROR: Usage: ./scripts/score_candidate.sh <post_id> <channel> <source_priority> <title> <transcript_score> <duration> <duplicate_flag>" >&2
  exit 1
fi

TITLE_LC=$(printf "%s" "$TITLE" | tr '[:upper:]' '[:lower:]')
PRIORITY_LC=$(printf "%s" "$SOURCE_PRIORITY" | tr '[:upper:]' '[:lower:]')
DUP_LC=$(printf "%s" "$DUPLICATE_FLAG" | tr '[:upper:]' '[:lower:]')

TRANSCRIPT_INT=$(awk "BEGIN { printf \"%d\", ($TRANSCRIPT_SCORE + 0) }")
DURATION_INT=$(awk "BEGIN { printf \"%d\", ($DURATION + 0) }")

SCORE=25
REASONS=()

if [[ "$TITLE_LC" =~ conflict|beef|vs|reaction|reacts|heated|argument|argues|meltdown|knockout|face\ off ]]; then
  SCORE=$((SCORE + 18))
  REASONS+=("title_has_conflict_or_reaction_terms")
fi

if [ "$TRANSCRIPT_INT" -ge 8 ]; then
  SCORE=$((SCORE + 20))
  REASONS+=("strong_transcript_spike")
elif [ "$TRANSCRIPT_INT" -ge 5 ]; then
  SCORE=$((SCORE + 12))
  REASONS+=("moderate_transcript_spike")
elif [ "$TRANSCRIPT_INT" -ge 3 ]; then
  SCORE=$((SCORE + 6))
  REASONS+=("light_transcript_signal")
fi

case "$PRIORITY_LC" in
  s|high)
    SCORE=$((SCORE + 15))
    REASONS+=("high_priority_source")
    ;;
  a|medium)
    SCORE=$((SCORE + 10))
    REASONS+=("medium_priority_source")
    ;;
  low)
    SCORE=$((SCORE + 4))
    REASONS+=("low_priority_source")
    ;;
esac

case "$CHANNEL" in
  sports)
    if [[ "$TITLE_LC" =~ nfl|nba|sports|game|locker\ room|press\ conference|highlight ]]; then
      SCORE=$((SCORE + 12))
      REASONS+=("strong_channel_fit")
    fi
    ;;
  arena)
    if [[ "$TITLE_LC" =~ streamer|kick|twitch|rage|reaction|beef|vs ]]; then
      SCORE=$((SCORE + 12))
      REASONS+=("strong_channel_fit")
    fi
    ;;
  women)
    if [[ "$TITLE_LC" =~ wnba|women|caitlin|angel|postgame|highlight ]]; then
      SCORE=$((SCORE + 12))
      REASONS+=("strong_channel_fit")
    fi
    ;;
  combat)
    if [[ "$TITLE_LC" =~ ufc|boxing|mma|knockout|weigh\ in|face\ off|fight|submission ]]; then
      SCORE=$((SCORE + 12))
      REASONS+=("strong_channel_fit")
    fi
    ;;
esac

if [ "$DURATION_INT" -ge 12 ] && [ "$DURATION_INT" -le 28 ]; then
  SCORE=$((SCORE + 12))
  REASONS+=("target_duration")
elif [ "$DURATION_INT" -ge 8 ] && [ "$DURATION_INT" -le 35 ]; then
  SCORE=$((SCORE + 6))
  REASONS+=("acceptable_duration")
else
  SCORE=$((SCORE - 8))
  REASONS+=("off_target_duration")
fi

if [ "$DUP_LC" = "1" ] || [ "$DUP_LC" = "true" ] || [ "$DUP_LC" = "yes" ]; then
  SCORE=$((SCORE - 60))
  REASONS+=("duplicate_penalty")
fi

[ "$SCORE" -gt 100 ] && SCORE=100
[ "$SCORE" -lt 0 ] && SCORE=0

DECISION="reject"
if [ "$SCORE" -ge 70 ]; then
  DECISION="approve_queue"
elif [ "$SCORE" -ge 50 ]; then
  DECISION="hold"
fi

[ "${#REASONS[@]}" -eq 0 ] && REASONS+=("baseline_score_only")

python3 - "$POST_ID" "$CHANNEL" "$SCORE" "$DECISION" "${REASONS[@]}" <<'PY'
import json
import sys

print(json.dumps({
    "post_id": sys.argv[1],
    "channel": sys.argv[2],
    "score": int(sys.argv[3]),
    "decision": sys.argv[4],
    "reasons": sys.argv[5:],
}))
PY
