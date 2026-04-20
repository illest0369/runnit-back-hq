#!/usr/bin/env python3

import json
import sys

import cv2


if len(sys.argv) != 4:
    print("Usage: render_tracked.py <input_video> <track.json> <output_video>")
    sys.exit(1)

VIDEO_PATH = sys.argv[1]
TRACK_PATH = sys.argv[2]
OUTPUT_PATH = sys.argv[3]

with open(TRACK_PATH, encoding="utf-8") as f:
    data = json.load(f)

points = data["points"]
target_w = int(data["target_width"])
target_h = int(data["target_height"])

if not points:
    print("ERROR: No tracking points found")
    sys.exit(1)

cap = cv2.VideoCapture(VIDEO_PATH)
if not cap.isOpened():
    print(f"ERROR: Could not open video: {VIDEO_PATH}")
    sys.exit(1)

fps = cap.get(cv2.CAP_PROP_FPS) or float(data.get("fps", 30.0) or 30.0)
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

if width <= 0 or height <= 0:
    cap.release()
    print("ERROR: Invalid video dimensions")
    sys.exit(1)

scale = target_h / height
scaled_w = int(round(width * scale))
max_crop_x = max(0, scaled_w - target_w)

fourcc = cv2.VideoWriter_fourcc(*"mp4v")
out = cv2.VideoWriter(OUTPUT_PATH, fourcc, fps, (target_w, target_h))
if not out.isOpened():
    cap.release()
    print(f"ERROR: Could not open writer: {OUTPUT_PATH}")
    sys.exit(1)

frame_idx = 0
point_idx = 0
smooth_x = None
alpha = 0.2

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.resize(frame, (scaled_w, target_h))
    time_sec = frame_idx / fps

    while point_idx < len(points) - 1 and points[point_idx + 1]["time"] <= time_sec:
        point_idx += 1

    crop_x = int(points[point_idx]["crop_x"])

    if smooth_x is None:
        smooth_x = float(crop_x)
    else:
        smooth_x = smooth_x + alpha * (crop_x - smooth_x)

    crop_x = int(round(smooth_x))
    crop_x = max(0, min(crop_x, max_crop_x))

    cropped = frame[:, crop_x:crop_x + target_w]
    if cropped.shape[1] != target_w:
        crop_x = max(0, min(max_crop_x, scaled_w - target_w))
        cropped = frame[:, crop_x:crop_x + target_w]

    out.write(cropped)
    frame_idx += 1

cap.release()
out.release()

print(f"RENDERED={OUTPUT_PATH}")
