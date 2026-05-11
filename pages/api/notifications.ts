import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { requireSession } from "@/lib/auth";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "notifications.json");

export interface Notification {
  id: string;
  type: "approved" | "rejected" | "scored" | "duplicate";
  post_id: string;
  channel: string;
  operator: string;
  score: number;
  cdn_url: string;
  timestamp: number;
  read: boolean;
  message?: string;
}

function readNotifications(): Notification[] {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")) as Notification[]; }
  catch { return []; }
}

function writeNotifications(data: Notification[]) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = requireSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  // GET — return unread count + recent notifications for this channel
  if (req.method === "GET") {
    const all = readNotifications();
    const mine = all.filter(n => !n.channel || n.channel === session.channel);
    const unread = mine.filter(n => !n.read).length;
    return res.status(200).json({ notifications: mine.slice(0, 30), unread });
  }

  // POST — mark all as read
  if (req.method === "POST") {
    const { action, id } = (req.body ?? {}) as { action?: string; id?: string };

    if (action === "mark_read") {
      const all = readNotifications();
      const updated = all.map(n => {
        if (id && n.id !== id) return n;
        if (!id && n.channel !== session.channel) return n;
        return { ...n, read: true };
      });
      writeNotifications(updated);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
