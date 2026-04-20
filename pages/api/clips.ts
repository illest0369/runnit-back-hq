import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionFromRequest } from "@/lib/auth";

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
  platform?: string;
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

const OUTPUTS_DIR = path.join(process.cwd(), "outputs");
const PERF_FILE = path.join(process.cwd(), "data", "performance.json");

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Duration string "HH:MM:SS-HH:MM:SS" → seconds as string e.g. "0:20" */
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
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Derive score sub-factors from reasons array (best-effort) */
function deriveFactors(reasons: string[], score: number): Pick<Clip, "kw" | "fit" | "dur_score" | "tx" | "dup"> {
  const has = (r: string) => reasons.includes(r);
  const kw   = has("strong_channel_fit") ? 0.9 : has("title_has_conflict_or_reaction_terms") ? 0.8 : 0.5;
  const fit  = has("strong_channel_fit") ? 0.85 : has("medium_priority_source") ? 0.65 : 0.45;
  const dur  = has("target_duration") ? 0.92 : has("acceptable_duration") ? 0.70 : has("off_target_duration") ? 0.30 : 0.60;
  const tx   = has("strong_transcript_spike") ? 0.85 : has("moderate_transcript_spike") ? 0.65 : has("light_transcript_signal") ? 0.45 : 0.30;
  const dup  = has("duplicate_penalty") ? -0.60 : 0;
  return { kw: +kw.toFixed(2), fit: +fit.toFixed(2), dur_score: +dur.toFixed(2), tx: +tx.toFixed(2), dup: +dup.toFixed(2) };
}

/** Derive a hook line from reasons + decision */
function deriveHook(reasons: string[], decision: string, score: number): string {
  if (reasons.includes("title_has_conflict_or_reaction_terms")) {
    return "heated moment — crowd reaction incoming";
  }
  if (reasons.includes("strong_transcript_spike")) {
    return "transcript spike — something big happened here";
  }
  if (decision === "approve_queue" && score >= 80) {
    return "top-tier clip — strong channel fit";
  }
  if (decision === "approve_queue") {
    return "solid clip — ready to post";
  }
  if (decision === "hold") {
    return "borderline — review before posting";
  }
  return "tap to review";
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { channel } = session;

  // 1. Read all outputs/*.json, group by post_id (keep newest mtime)
  const byPostId = new Map<string, { mtime: number; meta: OutputMeta }>();

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(OUTPUTS_DIR, { withFileTypes: true });
  } catch {
    // outputs dir may not exist in dev
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "track.json") continue;
    const fullPath = path.join(OUTPUTS_DIR, entry.name);
    const meta = readJson<OutputMeta>(fullPath);
    if (!meta?.post_id) continue;

    const mtime = fs.statSync(fullPath).mtimeMs;
    const existing = byPostId.get(meta.post_id);
    if (!existing || mtime > existing.mtime) {
      byPostId.set(meta.post_id, { mtime, meta });
    }
  }

  // 2. Read performance.json for views/likes/created_at
  const perf = readJson<PerfRecord[]>(PERF_FILE) ?? [];
  const perfById = new Map<string, PerfRecord>(perf.map(p => [p.post_id, p]));

  // 3. Build clip list, filtered to this channel
  const clips: Clip[] = [];

  for (const [postId, { meta }] of byPostId) {
    const clipChannel = meta.channel ?? "";
    if (clipChannel !== channel) continue;
    if (meta.status === "rejected" || meta.decision === "reject") continue;

    const reasons = meta.reasons ?? [];
    const score = meta.score ?? 0;
    const decision = meta.decision ?? "hold";
    const perfRec: Partial<PerfRecord> = perfById.get(postId) ?? {};

    const factors = deriveFactors(reasons, score);
    const hook = deriveHook(reasons, decision, score);
    const duration = parseDuration(meta.timestamp_range);

    clips.push({
      id: postId,
      channel: clipChannel,
      operator: meta.operator ?? "",
      cdn_url: meta.cdn_url ?? perfRec.cdn_url ?? "",
      score,
      decision,
      reasons,
      hook,
      duration,
      kw:        factors.kw,
      fit:       factors.fit,
      dur_score: factors.dur_score,
      tx:        factors.tx,
      dup:       factors.dup,
      views:    perfRec.views    ?? 0,
      likes:    perfRec.likes    ?? 0,
      shares:   perfRec.shares   ?? 0,
      created_at: perfRec.created_at ?? meta.cdn_url ? 0 : 0,
    });
  }

  // 4. Sort: approve_queue first, then by score desc
  clips.sort((a, b) => {
    const aIsQueue = a.decision === "approve_queue" ? 0 : 1;
    const bIsQueue = b.decision === "approve_queue" ? 0 : 1;
    if (aIsQueue !== bIsQueue) return aIsQueue - bIsQueue;
    return b.score - a.score;
  });

  return res.status(200).json({ clips });
}
