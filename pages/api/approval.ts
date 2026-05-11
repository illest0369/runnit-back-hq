import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { requireSession } from "@/lib/auth";

const SAFE_POST_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function isValidAction(a: string): a is "approve" | "reject" {
  return a === "approve" || a === "reject";
}

// ── File helpers ──────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")) as T;
  } catch { return fallback; }
}

function writeJson(file: string, data: unknown) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

interface ClipMeta {
  post_id?: string;
  channel?: string;
  operator?: string;
  cdn_url?: string;
  score?: number;
  decision?: string;
  reasons?: string[];
  status?: string;
  timestamp_range?: string;
  platform?: string;
  input_file?: string;
  output_file?: string;
}

interface PublishEntry {
  post_id: string;
  channel: string;
  operator: string;
  cdn_url: string;
  action: "approve" | "reject";
  approved_by: string;
  approved_at: number;
  score: number;
}

interface Notification {
  id: string;
  type: "approved" | "rejected";
  post_id: string;
  channel: string;
  operator: string;
  score: number;
  cdn_url: string;
  timestamp: number;
  read: boolean;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = requireSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  const { post_id, action, channel } = (req.body ?? {}) as {
    post_id?: string;
    action?: string;
    channel?: string;
  };

  if (!post_id || !action) return res.status(400).json({ error: "Missing fields" });
  if (typeof post_id !== "string" || !SAFE_POST_ID_RE.test(post_id))
    return res.status(400).json({ error: "Invalid post_id" });
  if (!isValidAction(action)) return res.status(400).json({ error: "Invalid action" });

  try {
    // 1. Update clips-index.json — mark the clip's decision + status
    const index = readJson<ClipMeta[]>("clips-index.json", []);
    let clipMeta: ClipMeta | undefined;

    const updated = index.map(c => {
      if (c.post_id !== post_id) return c;
      clipMeta = c;
      return {
        ...c,
        decision: action === "approve" ? "approved" : "rejected",
        status:   action === "approve" ? "approved" : "rejected",
      };
    });

    writeJson("clips-index.json", updated);

    // 2. Write to publish-log.json if approved
    if (action === "approve" && clipMeta) {
      const log = readJson<PublishEntry[]>("publish-log.json", []);
      const entry: PublishEntry = {
        post_id,
        channel:     channel ?? clipMeta.channel ?? session.channel,
        operator:    clipMeta.operator ?? session.username,
        cdn_url:     clipMeta.cdn_url ?? "",
        action:      "approve",
        approved_by: session.username,
        approved_at: Math.floor(Date.now() / 1000),
        score:       clipMeta.score ?? 0,
      };
      // Avoid duplicate entries
      const exists = log.some(e => e.post_id === post_id);
      if (!exists) log.unshift(entry);
      writeJson("publish-log.json", log);
    }

    // 3. Push in-app notification
    const notifications = readJson<Notification[]>("notifications.json", []);
    const notif: Notification = {
      id:        `${post_id}_${Date.now()}`,
      type:      action === "approve" ? "approved" : "rejected",
      post_id,
      channel:   channel ?? clipMeta?.channel ?? session.channel,
      operator:  clipMeta?.operator ?? session.username,
      score:     clipMeta?.score ?? 0,
      cdn_url:   clipMeta?.cdn_url ?? "",
      timestamp: Math.floor(Date.now() / 1000),
      read:      false,
    };
    notifications.unshift(notif);
    // Keep last 100 notifications
    writeJson("notifications.json", notifications.slice(0, 100));

    return res.status(200).json({ success: true, action, post_id });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "Failed to record decision", details: msg });
  }
}
