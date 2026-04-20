#!/usr/bin/env python3
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

STORE_PATH = Path("data/processed_videos.json")


def ensure_store() -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not STORE_PATH.exists():
        STORE_PATH.write_text("{}\n")


def extract_key(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()

    if "youtu.be" in host:
        video_id = parsed.path.strip("/").split("/")[0]
        if video_id:
            return f"youtube:{video_id}"

    if "youtube.com" in host:
        query_id = parse_qs(parsed.query).get("v", [None])[0]
        if query_id:
            return f"youtube:{query_id}"

        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) >= 2 and parts[0] in {"shorts", "embed"}:
            return f"youtube:{parts[1]}"

    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    return f"urlsha:{digest}"


def read_store() -> dict:
    ensure_store()
    with STORE_PATH.open() as f:
        return json.load(f)


def write_store(store: dict) -> None:
    STORE_PATH.write_text(json.dumps(store, indent=2) + "\n")


def cmd_check(channel: str, url: str) -> int:
    key = extract_key(url)
    store = read_store()
    entry = store.get(key)

    if not entry:
        print(json.dumps({"result": "new", "key": key}))
        return 0

    owner = entry.get("channel", "")
    if owner == channel:
        print(json.dumps({"result": "duplicate", "key": key, "channel": owner}))
        return 10

    print(json.dumps({"result": "cross_channel", "key": key, "channel": owner}))
    return 11


def cmd_mark(channel: str, url: str) -> int:
    key = extract_key(url)
    store = read_store()
    store[key] = {
        "channel": channel,
        "processed_at": int(time.time())
    }
    write_store(store)
    print(json.dumps({"result": "marked", "key": key, "channel": channel}))
    return 0


def main() -> int:
    if len(sys.argv) != 4 or sys.argv[1] not in {"check", "mark"}:
        print("Usage: dedup_video.py <check|mark> <channel> <url>", file=sys.stderr)
        return 1

    command, channel, url = sys.argv[1], sys.argv[2], sys.argv[3]

    if command == "check":
        return cmd_check(channel, url)
    return cmd_mark(channel, url)


if __name__ == "__main__":
    raise SystemExit(main())
