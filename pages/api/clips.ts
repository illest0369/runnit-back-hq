import type { NextApiRequest, NextApiResponse } from "next";
import clipsIndex from "@/data/clips-index.json";
import perfData from "@/data/performance.json";

// ── Inline session helpers (no fs/path at module level) ──────────────────────
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

function getSession(req: NextApiRequest): SessionPayload | null {
  const cookies = parseCookies(req.headers.cookie);
  return decodeSession(cookies[SESSION_COOKIE]);
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface Clip {
  id: string;
  channel: string;
  operator: string;
  cdn_url: string;
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseDuration(range?: string): string {
  if (!range) return "";
  const parts = range.split("-");
  if (parts.length < 2) return "";
  function toSecs(ts: string) {
    const segs = ts.split(":").map(Number);
    if (segs.length === 3) return segs[0] * 3600 + segs[1] * 60 + segs[2];
    if (segs.length === 2) return segs[0] * 60 + segs[1];
    return segs[0];
  }
  const diff = Math.max(0, toSecs(parts[1]) - toSecs(parts[0]));
  return `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, "0")}`;
}

function deriveFactors(reasons: string[]): Pick<Clip, "kw" | "fit" | "dur_score" | "tx" | "dup"> {
  const has = (r: string) => reasons.includes(r);
  return {
    kw:        +(has("strong_channel_fit") ? 0.9 : has("title_has_conflict_or_reaction_terms") ? 0.8 : 0.5).toFixed(2),
    fit:       +(has("strong_channel_fit") ? 0.85 : has("medium_priority_source") ? 0.65 : 0.45).toFixed(2),
    dur_score: +(has("target_duration") ? 0.92 : has("acceptable_duration") ? 0.70 : has("off_target_duration") ? 0.30 : 0.60).toFixed(2),
    tx:        +(has("strong_transcript_spike") ? 0.85 : has("moderate_transcript_spike") ? 0.65 : has("light_transcript_signal") ? 0.45 : 0.30).toFixed(2),
    dup:       has("duplicate_penalty") ? -0.60 : 0,
  };
}

function deriveHook(reasons: string[], decision: string, score: number): string {
  if (reasons.includes("title_has_conflict_or_reaction_terms")) return "heated moment — crowd reaction incoming";
  if (reasons.includes("strong_transcript_spike")) return "transcript spike — something big happened here";
  if (decision === "approve_queue" && score >= 80) return "top-tier clip — strong channel fit";
  if (decision === "approve_queue") return "solid clip — ready to post";
  if (decision === "hold") return "borderline — review before posting";
  return "tap to review";
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  const { channel } = session;

  // Deduplicate: keep highest-score record per post_id
  const byPostId = new Map<string, OutputMeta>();
  for (const meta of clipsIndex as OutputMeta[]) {
    if (!meta.post_id) continue;
    const existing = byPostId.get(meta.post_id);
    if (!existing || (meta.score ?? 0) > (existing.score ?? 0)) {
      byPostId.set(meta.post_id, meta);
    }
  }

  const perfById = new Map<string, PerfRecord>((perfData as PerfRecord[]).map(p => [p.post_id, p]));

  const clips: Clip[] = [];
  for (const [postId, meta] of byPostId) {
    if ((meta.channel ?? "") !== channel) continue;
    if (meta.status === "rejected" || meta.decision === "reject") continue;

    const reasons = meta.reasons ?? [];
    const score = meta.score ?? 0;
    const decision = meta.decision ?? "hold";
    const perf: Partial<PerfRecord> = perfById.get(postId) ?? {};

    clips.push({
      id: postId,
      channel: meta.channel ?? "",
      operator: meta.operator ?? "",
      cdn_url: meta.cdn_url ?? perf.cdn_url ?? "",
      score, decision, reasons,
      hook: deriveHook(reasons, decision, score),
      duration: parseDuration(meta.timestamp_range),
      ...deriveFactors(reasons),
      views:      perf.views     ?? 0,
      likes:      perf.likes     ?? 0,
      shares:     perf.shares    ?? 0,
      created_at: perf.created_at ?? 0,
    });
  }

  clips.sort((a, b) => {
    const aQ = a.decision === "approve_queue" ? 0 : 1;
    const bQ = b.decision === "approve_queue" ? 0 : 1;
    return aQ !== bQ ? aQ - bQ : b.score - a.score;
  });

  return res.status(200).json({ clips });
}
