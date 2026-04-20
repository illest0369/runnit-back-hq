#!/bin/bash
set -e

INPUT=$1
START=$2
END=$3
OUTPUT=$4

to_seconds() {
  IFS=':' read -r h m s <<< "$1"
  echo $((10#$h * 3600 + 10#$m * 60 + 10#$s))
}

START_SEC=$(to_seconds "$START")
END_SEC=$(to_seconds "$END")
DURATION=$((END_SEC - START_SEC))

if [ "$DURATION" -lt 6 ] || [ "$DURATION" -gt 35 ]; then
  echo "ERROR: Clip duration $DURATION seconds is outside allowed range (6–35)"
  exit 1
fi

ffmpeg -y -ss "$START" -to "$END" -i "$INPUT" \
-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
-af "loudnorm=I=-16:TP=-1.5:LRA=11" \
-c:v libx264 -preset fast -crf 23 \
-c:a aac -b:a 128k \
-movflags +faststart \
"$OUTPUT"

if [ ! -f "$OUTPUT" ]; then
  echo "ERROR: Output file not created"
  exit 1
fi

FILESIZE=$(stat -f%z "$OUTPUT")

if [ "$FILESIZE" -lt 50000 ]; then
  echo "ERROR: Output file too small"
  exit 1
fi

echo "SUCCESS: $OUTPUT created ($FILESIZE bytes)"
