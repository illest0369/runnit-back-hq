import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";

const SAFE_POST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidAction(a: string): a is "approve" | "reject" {
  return a === "approve" || a === "reject";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  const { post_id, action } = (req.body ?? {}) as { post_id?: string; action?: string };

  if (!post_id || !action) return res.status(400).json({ error: "Missing fields" });
  if (!SAFE_POST_ID_RE.test(post_id)) return res.status(400).json({ error: "Invalid post_id" });
  if (!isValidAction(action)) return res.status(400).json({ error: "Invalid action" });

  const newStatus = action === "approve" ? "approved" : "rejected";

  // Fetch the post to get score and channel context
  const { data: post, error: fetchErr } = await supabase
    .from("posts")
    .select("id, status, score, video_url, channel_id")
    .eq("id", post_id)
    .single();

  if (fetchErr || !post) {
    return res.status(404).json({ error: "Post not found" });
  }

  // Update the post status
  const { error: updateErr } = await supabase
    .from("posts")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", post_id);

  if (updateErr) {
    return res.status(500).json({ error: "Failed to update post", detail: updateErr.message });
  }

  // Write audit log entry
  await supabase.from("war_room_audit_logs").insert({
    post_id,
    stage:    "hq_approval",
    actor:    session.username,
    decision: action,
    from_state: post.status,
    to_state:   newStatus,
  });

  // Forward to posting server if approved (fire-and-forget)
  const postingUrl = process.env.POSTING_SERVER_URL;
  if (action === "approve" && postingUrl && post.video_url) {
    fetch(`${postingUrl}/post-${session.channel}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        post_id,
        video_url: post.video_url,
        channel: session.channel,
        status: "approved",
      }),
    }).catch(() => {});
  }

  return res.status(200).json({ success: true, action, post_id });
}
