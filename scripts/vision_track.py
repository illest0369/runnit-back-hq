#!/usr/bin/env python3
import json
import math
import os
import sys
from typing import List, Dict, Tuple

import cv2
import numpy as np


def clamp(val: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, val))


def smooth_series(points: List[Tuple[float, float]], alpha: float = 0.2) -> List[Tuple[float, float]]:
    if not points:
        return []
    out = [points[0]]
    for x, y in points[1:]:
        px, py = out[-1]
        out.append((px + alpha * (x - px), py + alpha * (y - py)))
    return out


def find_face_center(gray: np.ndarray, face_cascade) -> Tuple[float, float] | None:
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(60, 60)
    )
    if len(faces) == 0:
        return None

    # Pick largest face
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    return (x + w / 2.0, y + h / 2.0)


def find_motion_center(prev_gray: np.ndarray, gray: np.ndarray) -> Tuple[float, float] | None:
    diff = cv2.absdiff(prev_gray, gray)
    _, thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
    thresh = cv2.GaussianBlur(thresh, (9, 9), 0)
    thresh = cv2.dilate(thresh, None, iterations=2)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = [c for c in contours if cv2.contourArea(c) > 1500]

    if not contours:
        return None

    # Pick biggest motion blob
    c = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(c)
    return (x + w / 2.0, y + h / 2.0)


def build_crop_plan(
    video_path: str,
    output_json: str,
    target_w: int = 1080,
    target_h: int = 1920,
    sample_every_n_frames: int = 6
) -> None:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Scale source to target height first, then crop width
    scaled_w = int(round(src_w * (target_h / src_h)))
    crop_w = target_w
    max_x = max(0, scaled_w - crop_w)

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )

    centers: List[Tuple[float, float]] = []
    times: List[float] = []

    prev_gray = None
    frame_idx = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame_idx % sample_every_n_frames != 0:
            frame_idx += 1
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        center = find_face_center(gray, face_cascade)
        if center is None and prev_gray is not None:
            center = find_motion_center(prev_gray, gray)

        if center is None:
            center = (src_w / 2.0, src_h / 2.0)

        centers.append(center)
        times.append(frame_idx / fps)

        prev_gray = gray
        frame_idx += 1

    cap.release()

    if not centers:
        raise RuntimeError("No frames analyzed")

    # Convert source-space X center to scaled-space crop x
    crop_points: List[Tuple[float, float]] = []
    scale_ratio = target_h / src_h

    for (cx, cy) in centers:
        scaled_cx = cx * scale_ratio
        crop_x = scaled_cx - (crop_w / 2.0)
        crop_x = clamp(crop_x, 0, max_x)
        crop_points.append((crop_x, 0.0))

    crop_points = smooth_series(crop_points, alpha=0.22)

    plan: Dict = {
        "video_path": video_path,
        "source_width": src_w,
        "source_height": src_h,
        "target_width": target_w,
        "target_height": target_h,
        "fps": fps,
        "frame_count": frame_count,
        "sample_every_n_frames": sample_every_n_frames,
        "points": [
            {
                "time": round(t, 3),
                "crop_x": int(round(x)),
                "crop_y": 0
            }
            for t, (x, y) in zip(times, crop_points)
        ]
    }

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(plan, f, indent=2)

    print(f"TRACK_PLAN={output_json}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 scripts/vision_track.py <input_video> <output_json>")
        sys.exit(1)

    video_path = sys.argv[1]
    output_json = sys.argv[2]
    build_crop_plan(video_path, output_json)
