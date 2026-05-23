import type { NextApiRequest, NextApiResponse } from "next";
import { supabase, CHANNEL_TO_HANDLE } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  // Resolve channel_id
  let channelId = session.channel_id ?? null;
  if (!channelId) {
    const handle = CHANNEL_TO_HANDLE[session.channel] ?? `runnitback${session.channel}`;
    const { data } = await supabase.from("channels").select("id").eq("handle", handle).single();
    channelId = data?.id ?? null;
  }

  if (!channelId) {
    return res.status(200).json({
      totalViews: 0, totalLikes: 0, totalShares: 0, totalPublished: 0,
      approvalRate: 0, conversionRate: 0, avgEngagement: 0, totalPending: 0,
      viewsByClip: [], channels: {}, publishedClips: [],
    });
  }

  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, status, score, created_at, video_url, thumbnail_url, hook, caption")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true });

  if (error) {
    return res.status(500).json({ error: "Failed to fetch stats", detail: error.message, table: "posts" });
  }

  const all = posts ?? [];

  const total = all.length;
  const approved = all.filter(p =>
    ["approved", "APPROVED_BY_HUMAN", "sent_to_buffer", "ready_to_post", "posted", "EXECUTED"].includes(p.status)
  ).length;
  const pending = all.filter(p =>
    ["queued", "needs_review", "ready", "GENERATED", "REVIEWED", "AI_DECISION"].includes(p.status)
  ).length;
  const published = all.filter(p => ["posted", "EXECUTED", "sent_to_publish", "publishing"].includes(p.status));

  const totalViews = 0;
  const totalLikes = 0;
  const totalShares = 0;

  const approvalRate  = total > 0 ? Math.round((approved / total) * 100) : 0;
  const conversionRate = totalViews > 0
    ? parseFloat((totalLikes / totalViews * 100).toFixed(1))
    : 0;
  const avgEngagement = 0;

  const viewsByClip = all.map(p => ({
    post_id: p.id,
    views: 0,
    created_at: p.created_at ? Math.floor(new Date(p.created_at).getTime() / 1000) : 0,
  }));

  const publishedClips = published
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .map(p => ({
      post_id: p.id,
      channel: session.channel,
      cdn_url: p.video_url ?? "",
      thumbnail_url: p.thumbnail_url ?? null,
      hook: p.hook || p.caption || "",
      views: 0,
      likes: 0,
      shares: 0,
      comments: 0,
      created_at: p.created_at ? Math.floor(new Date(p.created_at).getTime() / 1000) : 0,
    }));

  return res.status(200).json({
    totalViews,
    totalLikes,
    totalShares,
    totalPublished: published.length,
    approvalRate,
    conversionRate,
    avgEngagement,
    totalPending: pending,
    viewsByClip,
    channels: { [session.channel]: total },
    publishedClips,
  });
}
