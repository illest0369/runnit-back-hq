#!/bin/bash
set -eo pipefail

CONFIG_FILE="config/sources.json"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: missing $CONFIG_FILE" >&2
  exit 1
fi

python3 - <<'PY'
import json
import sys
from collections import defaultdict

config_path = "config/sources.json"
with open(config_path) as f:
    data = json.load(f)

owners = defaultdict(list)

for channel, urls in data.items():
    if not isinstance(urls, list):
        print(f"ERROR: channel {channel} must contain an array", file=sys.stderr)
        sys.exit(1)
    for url in urls:
        owners[url].append(channel)

duplicates = {url: channels for url, channels in owners.items() if len(channels) > 1}

if duplicates:
    for url, channels in sorted(duplicates.items()):
        print(f"DUPLICATE_SOURCE: {url} -> {', '.join(channels)}", file=sys.stderr)
    sys.exit(1)

print("SOURCES_VALID")
PY
