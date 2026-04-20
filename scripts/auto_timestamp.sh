#!/bin/bash
set -eo pipefail

URL=$1

TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

# 1. Download subtitles + video
yt-dlp \
  --write-auto-sub \
  --sub-lang en \
  --skip-download \
  --quiet \
  "$URL" || true

SUB_FILE=$(ls *.vtt 2>/dev/null | head -n 1)

if [ -z "$SUB_FILE" ]; then
  echo "ERROR: No subtitles found"
  exit 1
fi

# 2. Convert VTT → plain text with timestamps
awk '
/-->/ {
  split($1, t, ":")
  sec = t[3]
  sub(/\..*/, "", sec)
  seconds = t[1]*3600 + t[2]*60 + sec
}
/^[^0-9]/ && length($0) > 3 {
  print seconds "|" tolower($0)
}
' "$SUB_FILE" > transcript.txt

# 3. Score lines for emotional spikes
awk -F"|" '
function score(text) {
  s=0

  if (text ~ /no way|what|wtf|crazy/) s+=4
  if (text ~ /bro|nah|yo/) s+=2
  if (text ~ /fight|argue|mad|heated/) s+=5
  if (text ~ /oh my god|omg/) s+=4
  if (text ~ /laugh|scream/) s+=3

  return s
}

{
  s = score($2)
  print s "|" $1 "|" $2
}
' transcript.txt | sort -nr > scored.txt

BEST=$(head -n 1 scored.txt)

SCORE=$(echo "$BEST" | cut -d"|" -f1)
TIME=$(echo "$BEST" | cut -d"|" -f2)

# 4. Generate clip window (centered around spike)
START=$((TIME-5))
END=$((TIME+15))

# enforce bounds
if [ "$START" -lt 0 ]; then START=0; fi

DURATION=$((END-START))

# enforce 6–35 rule
if [ "$DURATION" -lt 6 ]; then END=$((START+6)); fi
if [ "$DURATION" -gt 35 ]; then END=$((START+35)); fi

# format timestamps
format_time() {
  printf "%02d:%02d:%02d\n" $(($1/3600)) $(($1%3600/60)) $(($1%60))
}

START_FMT=$(format_time $START)
END_FMT=$(format_time $END)

echo ""
echo "=== AUTO TIMESTAMP ==="
echo "SCORE: $SCORE"
echo "PEAK TIME: $TIME sec"
echo "WINDOW: $START_FMT → $END_FMT"

echo ""
echo "=== READY ==="
echo "./scripts/run_pipeline.sh \"$URL\" $START_FMT $END_FMT auto_clip_001 tiktok maly"

cd ~
rm -rf "$TMP_DIR"
