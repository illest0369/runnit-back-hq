import type { NextApiRequest, NextApiResponse } from "next";
import { supabase, CHANNEL_TO_HANDLE } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export interface Clip {
  id: string;
  channel: string;
  operator: string;
  cdn_url: string;
  thumbnail_url: string | null;
  score: number;
  decision: string;
  reasons: string[];
  hook: string;
  duration: string;
  kw: number;
  fit: number;
  dur_score: number;
  tx: number;
  dup: number;
  views: number;
  likes: number;
  shares: number;
  created_at: number;
}

const SKIP_STATUSES = ["rejected", "REJECTED", "failed", "FAILED", "posted", "EXECUTED"];

function statusToDecision(status: string): string {
  if (["approved", "APPROVED_BY_HUMAN", "sent_to_buffer", "ready_to_post"].includes(status)) return "approve_queue";
  if (["rejected", "REJECTED"].includes(status)) return "reject";
  return "hold";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  // Resolve channel_id: prefer session value, fall back to Supabase lookup
  let channelId = session.channel_id ?? null;
  if (!channelId) {
    const handle = CHANNEL_TO_HANDLE[session.channel] ?? `runnitback${session.channel}`;
    const { data } = await supabase
      .from("channels")
      .select("id")
      .eq("handle", handle)
      .single();
    channelId = data?.id ?? null;
  }

  if (!channelId) return res.status(200).json({ clips: [] });

  type PostRow = {
    id: string; status: string; video_url: string | null; source_video_url: string | null;
    thumbnail_url: string | null; hook: string | null; caption: string | null;
    score: string | number | null; brand_fit: string | number | null;
    watchability: string | number | null; created_at: string | null;
    start_time: string | number | null; end_time: string | number | null;
  };

  const { data: rawPosts, error } = await supabase
    .from("posts")
    .select(
      "id, status, video_url, source_video_url, thumbnail_url, hook, caption, score, " +
      "brand_fit, watchability, created_at, start_time, end_time"
    )
    .eq("channel_id", channelId)
    .not("status", "in", `(${SKIP_STATUSES.join(",")})`)
    .order("score", { ascending: false })
    .limit(100);

  if (error) {
    return res.status(500).json({ error: "Failed to fetch clips", detail: error.message, table: "posts" });
  }

  const posts = (rawPosts ?? []) as unknown as PostRow[];
  const clips: Clip[] = posts.map(p => {
    const score = Number(p.score) || 0;
    const start = Number(p.start_time) || 0;
    const end = Number(p.end_time) || 0;
    const diffSecs = end > start ? Math.round(end - start) : 0;
    const duration = diffSecs > 0
      ? `${Math.floor(diffSecs / 60)}:${String(diffSecs % 60).padStart(2, "0")}`
      : "";

    return {
      id: p.id,
      channel: session.channel,
      operator: session.username,
      cdn_url: p.video_url ?? p.source_video_url ?? "",
      thumbnail_url: p.thumbnail_url ?? null,
      score,
      decision: statusToDecision(p.status),
      reasons: [],
      hook: p.hook || p.caption || "",
      duration,
      kw: 0.5,
      fit: Number(p.brand_fit) / 100 || 0.5,
      dur_score: diffSecs >= 30 && diffSecs <= 180 ? 0.9 : 0.5,
      tx: 0.5,
      dup: 0,
      views: 0,
      likes: 0,
      shares: 0,
      created_at: p.created_at ? Math.floor(new Date(p.created_at).getTime() / 1000) : 0,
    };
  });

  // Approved-first, then by score
  clips.sort((a, b) => {
    const aQ = a.decision === "approve_queue" ? 0 : 1;
    const bQ = b.decision === "approve_queue" ? 0 : 1;
    return aQ !== bQ ? aQ - bQ : b.score - a.score;
  });

  return res.status(200).json({ clips });
}
