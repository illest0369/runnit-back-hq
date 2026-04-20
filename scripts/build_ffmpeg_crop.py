#!/usr/bin/env python3
import json
import sys

if len(sys.argv) != 2:
    print("Usage: build_ffmpeg_crop.py <track.json>")
    sys.exit(1)

track_file = sys.argv[1]

with open(track_file) as f:
    data = json.load(f)

points = data["points"]

expr = []

for p in points:
    t = p["time"]
    x = p["crop_x"]
    expr.append(f"between(t,{t},{t+0.25})*{x}")

# fallback = center
expr_str = "+".join(expr)

print(f"x='{expr_str}':y=0")
