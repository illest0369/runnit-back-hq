import type { NextApiRequest, NextApiResponse } from "next";
import { supabase, CHANNEL_TO_HANDLE } from "@/lib/supabase";
import { getSession } from "@/lib/session";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  // GET — return recent audit log entries as notifications
  if (req.method === "GET") {
    // Resolve channel_id for filtering
    let channelId = session.channel_id ?? null;
    if (!channelId) {
      const handle = CHANNEL_TO_HANDLE[session.channel] ?? `runnitback${session.channel}`;
      const { data } = await supabase.from("channels").select("id").eq("handle", handle).single();
      channelId = data?.id ?? null;
    }

    // Fetch recent audit log entries, joining posts to filter by channel
    let query = supabase
      .from("war_room_audit_logs")
      .select("id, post_id, clip_id, stage, actor, decision, from_state, to_state, timestamp")
      .not("decision", "is", null)
      .order("timestamp", { ascending: false })
      .limit(30);

    if (channelId) {
      // Filter to posts in this channel via subquery
      const { data: channelPostIds } = await supabase
        .from("posts")
        .select("id")
        .eq("channel_id", channelId);

      const ids = (channelPostIds ?? []).map(p => p.id);
      if (ids.length > 0) {
        query = query.in("post_id", ids);
      }
    }

    const { data: logs } = await query;

    const notifications: Notification[] = (logs ?? []).map(log => ({
      id: log.id,
      type: (log.decision === "approve" ? "approved" : log.decision === "reject" ? "rejected" : "scored") as Notification["type"],
      post_id: log.post_id ?? log.clip_id ?? "",
      channel: session.channel,
      operator: log.actor ?? session.username,
      score: 0,
      cdn_url: "",
      timestamp: log.timestamp ? Math.floor(new Date(log.timestamp).getTime() / 1000) : 0,
      read: false,
    }));

    const unread = notifications.length;
    return res.status(200).json({ notifications, unread });
  }

  // POST — mark as read (no-op since audit logs are immutable; acknowledged client-side)
  if (req.method === "POST") {
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
