#!/usr/bin/env python3

import json
import sys

import cv2
import supervision as sv
from ultralytics import YOLO


if len(sys.argv) != 3:
    print("Usage: elite_track.py <input_video> <output_json>")
    sys.exit(1)

VIDEO_PATH = sys.argv[1]
OUTPUT_JSON = sys.argv[2]

TARGET_W = 1080
TARGET_H = 1920
FRAME_STRIDE = 4

model = YOLO("yolov8n.pt")
tracker = sv.ByteTrack()

cap = cv2.VideoCapture(VIDEO_PATH)
if not cap.isOpened():
    print(f"ERROR: Could not open video: {VIDEO_PATH}")
    sys.exit(1)

fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

if width <= 0 or height <= 0:
    cap.release()
    print("ERROR: Invalid video dimensions")
    sys.exit(1)

max_frames = max(1, int(fps * 35))
scale = TARGET_H / height
max_crop_x = max(0, int(width * scale - TARGET_W))

points = []
track_scores = {}
frame_idx = 0

while frame_idx < max_frames:
    ret, frame = cap.read()
    if not ret:
        break

    if frame_idx % FRAME_STRIDE != 0:
        frame_idx += 1
        continue

    results = model(frame, verbose=False)[0]
    detections = sv.Detections.from_ultralytics(results)

    if detections.class_id is not None:
        detections = detections[detections.class_id == 0]

    detections = tracker.update_with_detections(detections)

    best_center = (width / 2.0, height / 2.0)

    if len(detections) > 0:
        best_score = -1.0
        best_id = None

        for i in range(len(detections)):
            x1, y1, x2, y2 = detections.xyxy[i]
            conf = float(detections.confidence[i]) if detections.confidence is not None else 0.0
            track_id = int(detections.tracker_id[i]) if detections.tracker_id is not None else -1

            cx = (x1 + x2) / 2.0
            cy = (y1 + y2) / 2.0
            area = max(0.0, (x2 - x1) * (y2 - y1))

            score = (
                0.4 * conf +
                0.3 * area +
                0.3 * track_scores.get(track_id, 0)
            )

            if score > best_score:
                best_score = score
                best_center = (cx, cy)
                best_id = track_id

        if best_id is not None:
            track_scores[best_id] = track_scores.get(best_id, 0) + 1

    cx, cy = best_center
    scaled_cx = cx * scale
    crop_x = int(scaled_cx - TARGET_W / 2)
    crop_x = max(0, min(crop_x, max_crop_x))
    time_sec = frame_idx / fps

    points.append({
        "time": round(time_sec, 3),
        "crop_x": crop_x,
        "crop_y": 0
    })

    frame_idx += 1

cap.release()

if not points:
    points.append({
        "time": 0.0,
        "crop_x": max_crop_x // 2,
        "crop_y": 0
    })

output = {
    "source_width": width,
    "source_height": height,
    "target_width": TARGET_W,
    "target_height": TARGET_H,
    "fps": fps,
    "points": points
}

with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2)

print(f"TRACK_PLAN={OUTPUT_JSON}")
