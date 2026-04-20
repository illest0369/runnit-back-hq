import type { NextApiRequest, NextApiResponse } from "next";
import clipsIndex from "@/data/clips-index.json";
import perfData from "@/data/performance.json";

const SESSION_COOKIE = "rb_session";

type SessionPayload = { username: string; channel: string };

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) acc[k.trim()] = v.join("=");
    return acc;
  }, {});
}

function decodeSession(value?: string): SessionPayload | null {
  if (!value) return null;
  try {
    const json = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(json) as SessionPayload;
    if (!parsed.username || !parsed.channel) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface OutputMeta {
  post_id?: string;
  channel?: string;
  operator?: string;
  cdn_url?: string;
  status?: string;
  score?: number;
  decision?: string;
  reasons?: string[];
  timestamp_range?: string;
}

interface PerfRecord {
  post_id: string;
  channel?: string;
  operator?: string;
  cdn_url?: string;
  created_at?: number;
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const cookies = parseCookies(req.headers.cookie);
  const session = decodeSession(cookies[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  const perf = perfData as PerfRecord[];
  const clips = clipsIndex as OutputMeta[];

  // Deduplicate clips by post_id
  const byPostId = new Map<string, OutputMeta>();
  for (const meta of clips) {
    if (!meta.post_id) continue;
    const ex = byPostId.get(meta.post_id);
    if (!ex || (meta.score ?? 0) > (ex.score ?? 0)) byPostId.set(meta.post_id, meta);
  }

  const allClips = [...byPostId.values()];
  const total = allClips.length;
  const approved = allClips.filter(c => c.decision === "approve_queue").length;

  const totalViews = perf.reduce((s, p) => s + (p.views ?? 0), 0);
  const totalLikes = perf.reduce((s, p) => s + (p.likes ?? 0), 0);
  const totalShares = perf.reduce((s, p) => s + (p.shares ?? 0), 0);

  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  const conversionRate = totalViews > 0
    ? parseFloat((totalLikes / totalViews * 100).toFixed(1))
    : 0;

  const avgEngagement = perf.length > 0
    ? parseFloat((perf.reduce((s, p) => {
        const v = p.views ?? 1;
        return s + ((p.likes ?? 0) / Math.max(v, 1) * 100);
      }, 0) / perf.length).toFixed(1))
    : 0;

  const viewsByClip = perf
    .map(p => ({ post_id: p.post_id, views: p.views ?? 0, created_at: p.created_at ?? 0 }))
    .sort((a, b) => a.created_at - b.created_at);

  const channelCounts: Record<string, number> = { sports: 0, arena: 0, women: 0, combat: 0 };
  for (const c of allClips) {
    const ch = c.channel ?? "";
    if (ch in channelCounts) channelCounts[ch]++;
  }

  // Published clips with full perf data (filtered by session channel)
  const publishedClips = perf
    .filter(p => !session.channel || p.channel === session.channel)
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

  return res.status(200).json({
    totalViews,
    totalLikes,
    totalShares,
    totalPublished: perf.length,
    approvalRate,
    conversionRate,
    avgEngagement,
    totalPending: approved,
    viewsByClip,
    channels: channelCounts,
    publishedClips,
  });
}
