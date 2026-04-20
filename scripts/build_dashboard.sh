#!/bin/bash
set -e

PERF_FILE="data/performance.json"
DASH_FILE="data/dashboard.html"

if [ ! -f "$PERF_FILE" ]; then
  echo "No performance data"
  exit 1
fi

ROWS_FILE=$(mktemp)
python3 > "$ROWS_FILE" <<'PY'
import glob
import html
import json
import os
from datetime import datetime, timezone

perf = json.load(open("data/performance.json"))

metadata_by_post = {}
for path in glob.glob("outputs/*.json"):
    try:
        with open(path) as f:
            payload = json.load(f)
    except Exception:
        continue

    post_id = payload.get("post_id")
    if not post_id:
        continue

    current = metadata_by_post.get(post_id)
    mtime = os.path.getmtime(path)
    if current is None or mtime > current["mtime"]:
        metadata_by_post[post_id] = {"mtime": mtime, "payload": payload}

rows = []
for item in perf:
    post_id = item.get("post_id", "")
    meta = metadata_by_post.get(post_id, {}).get("payload", {})
    decision = meta.get("decision", "hold")
    if decision == "reject":
        continue

    score = int(meta.get("score", 0) or 0)
    reasons = meta.get("reasons", [])
    reason_text = ", ".join(reasons[:3]) if reasons else "score_pending"
    created = datetime.fromtimestamp(int(item.get("created_at", 0)), tz=timezone.utc).isoformat().replace("+00:00", "Z")
    score_class = "high" if score >= 80 else "mid" if score >= 60 else "low"

    rows.append(
        f'<tr data-post-id="{html.escape(post_id)}" data-channel="{html.escape(item.get("channel", ""))}" data-score="{score}" data-decision="{html.escape(decision)}" data-reasons="{html.escape(json.dumps(reasons))}">'
        f'<td>{html.escape(post_id)}</td>'
        f'<td>{html.escape(item.get("channel", ""))}</td>'
        f'<td>{html.escape(item.get("operator", ""))}</td>'
        f'<td><span class="score-pill score-{score_class}">[{score}]</span> {html.escape(decision)}<div class="reason-list">({html.escape(reason_text)})</div></td>'
        f'<td>{item.get("views", 0)}</td>'
        f'<td>{item.get("likes", 0)}</td>'
        f'<td>{item.get("shares", 0)}</td>'
        f'<td><a href="{html.escape(item.get("cdn_url", ""))}" target="_blank">Download</a></td>'
        f'<td><span id="status-{html.escape(post_id)}">pending</span></td>'
        f'<td><button onclick="handleAction(\'{html.escape(post_id)}\', \'approve\')">Approve</button> <button onclick="handleAction(\'{html.escape(post_id)}\', \'reject\')">Reject</button></td>'
        f'<td>{created}</td>'
        "</tr>"
    )

print("\n".join(rows))
PY

cat <<'HEADER' > "$DASH_FILE"
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Runnit Back HQ</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 2rem; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; padding: 0.9rem 1rem; background: #141414; border: 1px solid #242424; border-radius: 12px; }
  .context { color: #b8b8b8; }
  .context strong { color: #fff; }
  .locked { color: #7ef0a8; }
  h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #fff; }
  .subtitle { color: #888; margin-bottom: 1rem; }
  .controls { display: flex; align-items: center; gap: 1rem; margin: 1.25rem 0 0.5rem; flex-wrap: wrap; }
  .controls label { color: #bbb; font-size: 0.95rem; }
  .controls select, .controls input { margin-left: 0.35rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th { background: #1a1a1a; color: #fff; padding: 12px 16px; text-align: left; font-weight: 600; border-bottom: 2px solid #333; }
  td { padding: 10px 16px; border-bottom: 1px solid #1a1a1a; vertical-align: top; }
  tr:hover { background: #111; }
  a { color: #4dabf7; text-decoration: none; }
  a:hover { text-decoration: underline; }
  button { background: #1f6feb; color: #fff; border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; margin-right: 8px; }
  button:last-child { background: #b42318; margin-right: 0; }
  button:disabled { opacity: 0.55; cursor: not-allowed; }
  .score-pill { display: inline-block; min-width: 3rem; padding: 2px 8px; border-radius: 999px; font-weight: 700; margin-right: 0.45rem; }
  .score-high { background: #123524; color: #7ef0a8; }
  .score-mid { background: #3b3209; color: #ffd24d; }
  .score-low { background: #2a2a2a; color: #b8b8b8; }
  .reason-list { color: #8f8f8f; font-size: 0.82rem; margin-top: 0.35rem; line-height: 1.35; }
</style>
</head>
<body>
<div class="topbar">
  <div class="context">
    Logged in as: <strong id="user-name">Loading...</strong>
  </div>
  <div class="context">
    Channel: <strong class="locked" id="user-channel">Loading...</strong>
  </div>
</div>
<h1>Runnit Back HQ</h1>
<p class="subtitle">Clip Dashboard — Best clips first</p>
<div class="controls">
  <label>Show:
    <select id="decision-filter">
      <option value="approve_queue" selected>approve_queue only</option>
      <option value="all">All</option>
      <option value="hold">hold only</option>
    </select>
  </label>
  <label>
    <input id="show-holds" type="checkbox" />
    Show holds
  </label>
</div>
<table>
<thead>
<tr><th>Post ID</th><th>Channel</th><th>Operator</th><th>Score</th><th>Views</th><th>Likes</th><th>Shares</th><th>Clip</th><th>Status</th><th>Actions</th><th>Created</th></tr>
</thead>
<tbody>
HEADER

cat "$ROWS_FILE" >> "$DASH_FILE"

cat <<'FOOTER' >> "$DASH_FILE"
</tbody>
</table>
<script>
const clips = Array.from(document.querySelectorAll("tbody tr")).map((row) => ({
  id: row.dataset.postId,
  channel: row.dataset.channel || "",
  score: Number(row.dataset.score || "0"),
  decision: row.dataset.decision || "hold",
  reasons: JSON.parse(row.dataset.reasons || "[]"),
  status: "pending",
  row
}));

const tbody = document.querySelector("tbody");
const decisionFilter = document.getElementById("decision-filter");
const showHoldsToggle = document.getElementById("show-holds");
const userNameNode = document.getElementById("user-name");
const userChannelNode = document.getElementById("user-channel");
const authState = {
  username: "",
  channel: ""
};

function formatName(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function setClips(updater) {
  const nextClips = updater(clips.map((clip) => ({ ...clip })));
  clips.splice(0, clips.length, ...nextClips);
  renderClips();
}

function shouldShowClip(clip) {
  if (!authState.channel || clip.channel !== authState.channel) {
    return false;
  }

  if (clip.decision === "reject") {
    return false;
  }

  const selected = decisionFilter.value;
  const showHolds = showHoldsToggle.checked;

  if (selected === "all") {
    return showHolds ? true : clip.decision !== "hold";
  }

  if (selected === "hold") {
    return clip.decision === "hold";
  }

  if (selected === "approve_queue") {
    return clip.decision === "approve_queue" || (showHolds && clip.decision === "hold");
  }

  return false;
}

async function loadSession() {
  const response = await fetch("/api/session", {
    credentials: "same-origin"
  });

  if (!response.ok) {
    window.location.href = "/login";
    return false;
  }

  const session = await response.json();
  authState.username = session.username || "";
  authState.channel = session.channel || "";
  userNameNode.textContent = formatName(authState.username);
  userChannelNode.textContent = `${formatName(authState.channel)} (locked)`;
  return true;
}

function renderClips() {
  const sorted = [...clips].sort((left, right) => right.score - left.score);

  sorted.forEach((clip) => {
    const statusNode = document.getElementById(`status-${clip.id}`);
    const row = clip.row;
    if (!statusNode || !row) {
      return;
    }

    statusNode.innerText = clip.status;
    row.style.display = shouldShowClip(clip) ? "" : "none";

    const buttons = row.querySelectorAll("button");
    const isLocked = clip.status === "approving" || clip.status === "rejecting";
    buttons.forEach((button) => {
      button.disabled = isLocked;
    });

    tbody.appendChild(row);
  });
}

async function handleAction(id, action) {
  setClips((prev) =>
    prev.map((clip) =>
      clip.id === id
        ? { ...clip, status: action === "approve" ? "approving" : "rejecting" }
        : clip
    )
  );

  try {
    const response = await fetch("/api/approval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ post_id: id, action })
    });

    if (!response.ok) {
      throw new Error("Request failed");
    }

    setClips((prev) =>
      prev.map((clip) =>
        clip.id === id
          ? { ...clip, status: action === "approve" ? "approved" : "rejected" }
          : clip
      )
    );
  } catch (error) {
    setClips((prev) =>
      prev.map((clip) =>
        clip.id === id ? { ...clip, status: "pending" } : clip
      )
    );
  }
}

decisionFilter.addEventListener("change", renderClips);
showHoldsToggle.addEventListener("change", renderClips);
loadSession().then((ok) => {
  if (ok) {
    renderClips();
  }
});
</script>
</body>
</html>
FOOTER

rm -f "$ROWS_FILE"
echo "DASHBOARD=$DASH_FILE"
