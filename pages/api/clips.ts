import type { NextApiRequest, NextApiResponse } from "next";
import { supabase, CHANNEL_TO_HANDLE } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export interface Clip {
  id: string;
  channel: string;
  operator: string;
  cdn_url: string;
  thumbnail_url: string | null;
  source_url: string;
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
const BASE_SELECT_COLUMNS =
  "id, status, video_url, source_video_url, thumbnail_url, hook, caption, score, " +
  "brand_fit, watchability, created_at, start_time, end_time";
const MEDIA_SELECT_COLUMNS =
  "id, status, video_url, rendered_video_url, processed_video_url, source_video_url, thumbnail_url, hook, caption, score, " +
  "brand_fit, watchability, created_at, start_time, end_time";

function statusToDecision(status: string): string {
  if (["approved", "APPROVED_BY_HUMAN", "sent_to_buffer", "ready_to_post"].includes(status)) return "approve_queue";
  if (["rejected", "REJECTED"].includes(status)) return "reject";
  return "hold";
}

function isPlayableMediaUrl(url?: string | null) {
  if (!url) return false;
  const normalized = url.toLowerCase();
  if (normalized.includes("youtube.com/watch") || normalized.includes("youtu.be/")) return false;
  if (normalized.includes("tiktok.com/")) return false;
  if (normalized.includes("instagram.com/")) return false;
  return normalized.startsWith("blob:") || normalized.includes(".mp4") || normalized.includes(".webm") || normalized.includes("r2.dev") || normalized.includes("cloudflare") || normalized.includes("cdn");
}

function firstPlayableMediaUrl(...urls: Array<string | null | undefined>) {
  return urls.find(isPlayableMediaUrl) ?? "";
}

type StatusRow = { id: string; status: string | null; channel_id?: string | null; created_at?: string | null };

function summarizeStatuses(rows: StatusRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const status = row.status ?? "NULL";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

function sampleRows(rows: StatusRow[]) {
  return rows.slice(0, 10).map(row => ({
    id: row.id,
    status: row.status,
    channel_id: row.channel_id,
    created_at: row.created_at,
  }));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  const debug = req.query.debug === "1";

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

  const filtersApplied = {
    table: "posts",
    select: MEDIA_SELECT_COLUMNS,
    channel_id: channelId,
    excludedStatuses: SKIP_STATUSES,
    order: "score.desc",
    limit: 100,
    scoreThreshold: null,
    createdAtWindow: null,
    approvedFlag: null,
  };

  if (!channelId) {
    if (debug) {
      return res.status(200).json({
        clipsCount: 0,
        channelId,
        authenticatedUser: { username: session.username, channel: session.channel },
        filtersApplied,
        counts: { allChannelsSample: null, channelRows: 0, afterStatusExclusion: 0, finalRows: 0 },
        statuses: { beforeStatusExclusion: {}, afterStatusExclusion: {} },
        sampleRows: [],
      });
    }
    return res.status(200).json({ clips: [] });
  }

  type PostRow = {
    id: string; status: string; video_url: string | null; rendered_video_url?: string | null; processed_video_url?: string | null;
    source_video_url: string | null; thumbnail_url: string | null; hook: string | null; caption: string | null;
    score: string | number | null; brand_fit: string | number | null;
    watchability: string | number | null; created_at: string | null;
    start_time: string | number | null; end_time: string | number | null;
  };

  const buildPostsQuery = (selectColumns: string) => supabase
    .from("posts")
    .select(selectColumns)
    .eq("channel_id", channelId)
    .not("status", "in", `(${SKIP_STATUSES.join(",")})`)
    .order("score", { ascending: false })
    .limit(100);

  const selectAttempts = [
    MEDIA_SELECT_COLUMNS,
    BASE_SELECT_COLUMNS.replace("source_video_url,", "rendered_video_url, source_video_url,"),
    BASE_SELECT_COLUMNS.replace("source_video_url,", "processed_video_url, source_video_url,"),
    BASE_SELECT_COLUMNS,
  ];
  let rawPosts: unknown[] | null = null;
  let error: { message: string } | null = null;
  let selectUsed = selectAttempts[0];

  for (const selectColumns of selectAttempts) {
    const result = await buildPostsQuery(selectColumns);
    rawPosts = result.data;
    error = result.error;
    selectUsed = selectColumns;
    if (!error) break;
    const optionalMediaColumnMissing = ["rendered_video_url", "processed_video_url"].some(column => error?.message.includes(column));
    if (!optionalMediaColumnMissing) break;
  }
  filtersApplied.select = selectUsed;

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
      cdn_url: firstPlayableMediaUrl(p.video_url, p.rendered_video_url, p.processed_video_url),
      thumbnail_url: p.thumbnail_url ?? null,
      source_url: p.source_video_url ?? "",
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

  if (debug) {
    const [channelCountResult, filteredCountResult, statusRowsResult, filteredStatusRowsResult] = await Promise.all([
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channelId),
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channelId)
        .not("status", "in", `(${SKIP_STATUSES.join(",")})`),
      supabase
        .from("posts")
        .select("id, status, channel_id, created_at")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("posts")
        .select("id, status, channel_id, created_at")
        .eq("channel_id", channelId)
        .not("status", "in", `(${SKIP_STATUSES.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const statusRows = ((statusRowsResult.data ?? []) as unknown as StatusRow[]);
    const filteredStatusRows = ((filteredStatusRowsResult.data ?? []) as unknown as StatusRow[]);
    const debugPayload = {
      clipsCount: clips.length,
      channelId,
      authenticatedUser: { username: session.username, channel: session.channel },
      filtersApplied,
      counts: {
        channelRows: channelCountResult.count ?? null,
        afterStatusExclusion: filteredCountResult.count ?? null,
        finalRows: posts.length,
      },
      statuses: {
        beforeStatusExclusion: summarizeStatuses(statusRows),
        afterStatusExclusion: summarizeStatuses(filteredStatusRows),
      },
      sampleRows: sampleRows(filteredStatusRows),
      errors: {
        channelCount: channelCountResult.error?.message ?? null,
        filteredCount: filteredCountResult.error?.message ?? null,
        statusRows: statusRowsResult.error?.message ?? null,
        filteredStatusRows: filteredStatusRowsResult.error?.message ?? null,
      },
    };

    console.info("RBHQ_CLIPS_DEBUG", debugPayload);
    return res.status(200).json(debugPayload);
  }

  return res.status(200).json({ clips });
}
