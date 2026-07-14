"use client";

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Download,
  Flame,
  Hash,
  ListChecks,
  LogOut,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Pause,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getCsrfHeaders } from "@/lib/client-csrf";
import type { PublishExportPackage } from "@/lib/export/types";
import { RBHQ_SOURCES, type RbhqSource, type RbhqSourceType } from "@/lib/rbhq-sources";

type AppTab = "dashboard" | "queue" | "plan" | "publish" | "sources" | "profile";
type ClipStatus = "pending" | "held" | "approving" | "approved" | "rejecting" | "rejected";
type PublishStatus =
  | "draft"
  | "ready_for_review"
  | "approved"
  | "queued"
  | "scheduled"
  | "published"
  | "failed"
  | "ready_for_automation"
  | "sent_to_n8n"
  | "automation_queued"
  | "automation_failed"
  | "not_ready"
  | "metricool_ready_manual_export"
  | "ready_for_manual_publish"
  | "metricool_scheduled"
  | "metricool_published"
  | "metricool_failed"
  | "manually_published";
type QueueAction = "approve" | "reject" | "hold" | "needs_clip_prep" | "create_mac_mini_package" | "stage_in_tiktok";

type RankLabel = "Hot" | "Solid" | "Hold" | "Reject";
type IntelligenceRankLabel = "must_post" | "strong" | "solid" | "low_priority";
type IntelligenceUrgency = "post_now" | "today" | "evergreen" | "hold";
type DisplayRankLabel = RankLabel | IntelligenceRankLabel;
type ReasonTag =
  | "breaking"
  | "rivalry"
  | "star_player"
  | "controversy"
  | "fan_reaction"
  | "highlight"
  | "debut"
  | "injury"
  | "championship"
  | "viral_audio_fit"
  | "low_quality"
  | "wrong_format";
type VerticalStatus = "vertical_ready" | "needs_resize" | "blocked_wrong_format" | "unknown";

type TikTokAnalysis = {
  priorityScore: number;
  rankLabel: RankLabel;
  reasonTags: ReasonTag[];
  whyNow: string;
  operatorSummary: string;
  confidence: "low" | "medium" | "high";
  captionDraft: string;
  hashtagPack: string[];
  hookLine: string;
  alternateCaptions?: string[];
  provider?: string;
  analyzedAt?: string;
};

type RBHQIntelligenceV1 = {
  score: number;
  rankLabel: IntelligenceRankLabel;
  urgency: IntelligenceUrgency;
  reasons: string[];
  suggestedCaption: string;
  suggestedHashtags: string[];
  hook: string;
  operatorSummary: string;
  whyNow: string;
};

type VerticalReadiness = {
  requiredWidth: 1080;
  requiredHeight: 1920;
  requiredRatio: "9:16";
  width: number | null;
  height: number | null;
  verticalStatus: VerticalStatus;
  manualException: boolean;
};

type PackageReadiness = {
  candidateId: string | null;
  candidateStatus: string | null;
  clipPrepStatus: string | null;
  clipPrepConfidence: string | null;
  clipPrepReady: boolean;
  clipPrep: ClipPrepSummary | null;
  macMiniPackageId: string | null;
  macMiniPackageStatus: string | null;
  macMiniHandoffStatus: string | null;
  macMiniPackageReady: boolean;
  localRenderStatus: string | null;
  localRenderAttached: boolean;
  localAssetPath: string | null;
  tiktokStaging: TikTokStagingReadiness;
};

type ClipPrepSummary = {
  status: string | null;
  confidence: string | null;
  suggestedStartSeconds: number | null;
  suggestedEndSeconds: number | null;
  suggestedLengthSeconds: number | null;
  clipReason: string | null;
  openingText: string | null;
  editNotes: string[];
  assetInstructions: string | null;
  transcriptTimed: boolean | null;
};

type TikTokStagingReadiness = {
  laneLabel: string | null;
  channelKey: string | null;
  packageId: string | null;
  status: "not_requested" | "requested" | "ready_for_manual_post" | "blocked" | "failed";
  operatorState: "not_ready" | "ready_to_stage" | "staging_requested" | "tiktok_login_blocked" | "dry_run_failed" | "ready_for_manual_post";
  eligible: boolean;
  readyForManualPost: boolean;
  loginBlocked: boolean;
  prepCanContinue: boolean;
  retryAfterAccessRestored: boolean;
  blocker: string | null;
  requestedAt: string | null;
  stagedAt: string | null;
  attachedAssetStatus: string | null;
  tikTokSession: "ready" | "missing" | "unknown";
  videoStaged: boolean;
  captionFilled: boolean;
  screenshotPath: string | null;
  error: string | null;
};

type User = {
  id: string;
  name: string;
  role?: string;
  channel?: string;
  channelLabel: string;
  channelDbId: string;
  channels?: UserChannel[];
  handle?: string;
  metricoolTestMode?: boolean;
};

type UserChannel = {
  id: string;
  channel: string;
  label: string;
  name: string;
  handle?: string;
};

type ReviewClipApi = {
  id: string;
  hook: string;
  title?: string | null;
  channel_id?: string | null;
  score: string | number;
  performance_score?: string | number | null;
  performance_label?: "flop" | "decent" | "strong" | "hit" | null;
  thumbnail_url: string | null;
  cdn_url: string | null;
  local_url: string | null;
  video_url: string | null;
  tiktok_url: string | null;
  source_video_url: string | null;
  source_url?: string | null;
  source_name?: string | null;
  source_type?: string | null;
  source?: {
    name: string | null;
    type: string | null;
    url: string | null;
    channel_id: string | null;
    external_id: string | null;
    original_platform: string | null;
    import_batch_id: string | null;
  } | null;
  sport?: string | null;
  league?: string | null;
  duration_seconds?: number | string | null;
  aspect_ratio?: string | null;
  recommended_hook?: string | null;
  moderation_notes?: string[] | null;
  risk_flags?: string[] | null;
  tiktok_analysis?: TikTokAnalysis | null;
  intelligence_v1?: RBHQIntelligenceV1 | null;
  vertical_readiness?: VerticalReadiness | null;
  package_readiness?: PackageReadiness | null;
  publish_status?: PublishStatus | null;
  review_status?: "pending" | "approved" | "rejected" | "skipped" | null;
  approved_at?: string | null;
};

type SourceFilterOption = {
  channel_id: string | null;
  source_name: string;
  source_type: string;
  pending_count: number;
  total_imported: number;
  last_ingested_at: string | null;
  status: "active" | "empty" | "stale";
};

type Clip = {
  id: string;
  title: string;
  hook: string;
  score: number;
  performanceLabel: "flop" | "decent" | "strong" | "hit";
  status: ClipStatus;
  publishStatus: PublishStatus;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  sourceName: string;
  sourceType: string;
  sourceUrl: string | null;
  sourceChannelId: string | null;
  sourceExternalId: string | null;
  originalPlatform: string | null;
  importBatchId: string | null;
  sport: string | null;
  league: string | null;
  durationSeconds: number | null;
  aspectRatio: string | null;
  recommendedHook: string | null;
  moderationNotes: string[];
  riskFlags: string[];
  analysis: TikTokAnalysis | null;
  intelligence: RBHQIntelligenceV1 | null;
  verticalReadiness: VerticalReadiness;
  packageReadiness: PackageReadiness;
  approvedAt: string | null;
};

type PublishQueueItem = Clip & {
  exportPackage: PublishExportPackage;
};

type DailyPlanClip = {
  id: string | null;
  title: string;
  channelId: string | null;
  lane: string;
  sourceName: string | null;
  score: number;
  rankLabel: IntelligenceRankLabel;
  urgency: IntelligenceUrgency;
  reasons?: string[];
  whyNow: string;
  operatorSummary: string;
  suggestedCaption: string;
  suggestedHashtags: string[];
  status?: string | null;
  publishStatus?: string | null;
  createdAt?: string | null;
};

type DailyPlanSourceCandidate = {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  sourceName: string;
  targetLane: string | null;
  score: number;
  rankLabel: IntelligenceRankLabel;
  urgency: IntelligenceUrgency;
  hook: string;
  suggestedCaption: string;
  suggestedHashtags: string[];
  whyNow: string;
  operatorSummary: string;
};

type DailyPlan = {
  generatedAt: string;
  topClipsToPostNow: DailyPlanClip[];
  strongAlternates: DailyPlanClip[];
  holdOrLowPriority: DailyPlanClip[];
  laneBalanceNotes: string[];
  suggestedPostingOrder: DailyPlanClip[];
  sourceCandidates: DailyPlanSourceCandidate[];
};

type QueueMode = "pending" | "held";
type DecisionAction = QueueAction;

const READY_PUBLISH_STATUSES = new Set<PublishStatus>(["metricool_ready_manual_export", "ready_for_manual_publish"]);
const DEFAULT_VERTICAL_READINESS: VerticalReadiness = {
  requiredWidth: 1080,
  requiredHeight: 1920,
  requiredRatio: "9:16",
  width: null,
  height: null,
  verticalStatus: "unknown",
  manualException: false,
};
const DEFAULT_PACKAGE_READINESS: PackageReadiness = {
  candidateId: null,
  candidateStatus: null,
  clipPrepStatus: null,
  clipPrepConfidence: null,
  clipPrepReady: false,
  clipPrep: null,
  macMiniPackageId: null,
  macMiniPackageStatus: null,
  macMiniHandoffStatus: null,
  macMiniPackageReady: false,
  localRenderStatus: null,
  localRenderAttached: false,
  localAssetPath: null,
  tiktokStaging: {
    laneLabel: null,
    channelKey: null,
    packageId: null,
    status: "not_requested",
    operatorState: "not_ready",
    eligible: false,
    readyForManualPost: false,
    loginBlocked: false,
    prepCanContinue: false,
    retryAfterAccessRestored: false,
    blocker: "Mac mini package is missing.",
    requestedAt: null,
    stagedAt: null,
    attachedAssetStatus: null,
    tikTokSession: "unknown",
    videoStaged: false,
    captionFilled: false,
    screenshotPath: null,
    error: null,
  },
};

const SOURCE_CODES: Record<string, string> = {
  all: "ALL",
  nba: "NBA",
  nfl: "NFL",
  ncaaf: "CFB",
  mlb: "MLB",
  soccer: "FC",
  combat: "KO",
  tiktok: "TT",
  youtube: "YT",
  unknown: "RB",
};

function themeForChannel(label: string | null | undefined) {
  const value = label?.toLowerCase() ?? "";
  if (value.includes("arena") || value.includes("gaming") || value.includes("esports")) return "arena";
  if (value.includes("women")) return "women";
  if (value.includes("combat")) return "combat";
  if (value.includes("futbol") || value.includes("soccer")) return "futbol";
  if (value.includes("cfb")) return "runnitbackcfb";
  return "sports";
}

function displayChannelLabel(label: string | null | undefined) {
  const value = label?.trim().toLowerCase() || "rbhq";
  if (value === "sports") return "rb sports";
  if (value === "arena") return "rb arena";
  if (value === "gaming / esports") return "gaming / esports";
  if (value === "women") return "rb women";
  if (value === "combat") return "rb combat";
  if (value === "cfb" || value === "runnitbackcfb") return "rb cfb";
  if (value.startsWith("rb ")) return value;
  return `rb ${value}`;
}

function formatCompactCount(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function shortText(value: string, max = 72) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 3).trim()}...` : clean;
}

function sourceAvatar(sourceName: string) {
  return sourceName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "RB";
}

function parseNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readMetricoolStatus(notes: string[] | null | undefined, fallback: PublishStatus | null | undefined): PublishStatus {
  const n8nMarker = notes?.find((note) => note.startsWith("n8n_status:"))?.slice("n8n_status:".length);
  if (
    n8nMarker === "ready_for_automation" ||
    n8nMarker === "sent_to_n8n" ||
    n8nMarker === "automation_queued" ||
    n8nMarker === "automation_failed"
  ) {
    return n8nMarker;
  }

  const marker = notes?.find((note) => note.startsWith("metricool_status:"))?.slice("metricool_status:".length);
  if (
    marker === "metricool_scheduled" ||
    marker === "metricool_published" ||
    marker === "metricool_failed" ||
    marker === "manually_published"
  ) {
    return marker;
  }

  return fallback ?? "not_ready";
}

function readTikTokAnalysis(notes: string[] | null | undefined, fallback: TikTokAnalysis | null | undefined): TikTokAnalysis | null {
  if (fallback) return fallback;
  const marker = notes?.find((note) => note.startsWith("tiktok_analyzer_v1:"))?.slice("tiktok_analyzer_v1:".length);
  if (!marker) return null;
  try {
    return JSON.parse(marker) as TikTokAnalysis;
  } catch {
    return null;
  }
}

function adaptTikTokAnalysisToIntelligence(analysis: TikTokAnalysis | null): RBHQIntelligenceV1 | null {
  if (!analysis) return null;
  const rankLabel: IntelligenceRankLabel =
    analysis.rankLabel === "Hot" ? "must_post" :
    analysis.rankLabel === "Solid" ? "strong" :
    analysis.rankLabel === "Hold" ? "solid" :
    "low_priority";
  const urgency: IntelligenceUrgency =
    analysis.rankLabel === "Hot" ? "post_now" :
    analysis.rankLabel === "Solid" ? "today" :
    analysis.rankLabel === "Reject" ? "hold" :
    "evergreen";

  return {
    score: analysis.priorityScore,
    rankLabel,
    urgency,
    reasons: analysis.reasonTags.map((tag) => formatReasonTag(tag)),
    suggestedCaption: analysis.captionDraft,
    suggestedHashtags: analysis.hashtagPack,
    hook: analysis.hookLine,
    operatorSummary: analysis.operatorSummary,
    whyNow: analysis.whyNow,
  };
}

function readRBHQIntelligenceV1(
  notes: string[] | null | undefined,
  direct: RBHQIntelligenceV1 | null | undefined,
  fallbackAnalysis: TikTokAnalysis | null,
): RBHQIntelligenceV1 | null {
  if (direct) return direct;
  const marker = notes?.find((note) => note.startsWith("rbhq_intelligence_v1:"))?.slice("rbhq_intelligence_v1:".length);
  if (marker) {
    try {
      return JSON.parse(marker) as RBHQIntelligenceV1;
    } catch {
      // Fall through to the legacy analyzer adapter.
    }
  }
  return adaptTikTokAnalysisToIntelligence(fallbackAnalysis);
}

async function readApiJson(response: Response, fallbackMessage: string) {
  try {
    return await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }
}

function normalizePackageReadiness(readiness: PackageReadiness | null | undefined): PackageReadiness {
  if (!readiness) return DEFAULT_PACKAGE_READINESS;
  return {
    ...DEFAULT_PACKAGE_READINESS,
    ...readiness,
    tiktokStaging: {
      ...DEFAULT_PACKAGE_READINESS.tiktokStaging,
      ...(readiness.tiktokStaging ?? {}),
    },
  };
}

function mapApiClip(item: ReviewClipApi): Clip | null {
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const title = typeof item.title === "string" ? item.title : "";
  const hook = typeof item.hook === "string" ? item.hook : "";
  const videoUrl = item.cdn_url ?? item.video_url ?? item.local_url ?? item.tiktok_url ?? item.source_video_url ?? null;
  const thumbnailUrl = item.thumbnail_url ?? null;
  const moderationNotes = Array.isArray(item.moderation_notes) ? item.moderation_notes : [];
  const publishStatus = readMetricoolStatus(moderationNotes, item.publish_status);
  const analysis = readTikTokAnalysis(moderationNotes, item.tiktok_analysis);
  const intelligence = readRBHQIntelligenceV1(moderationNotes, item.intelligence_v1, analysis);

  if (!id || !videoUrl) return null;

  return {
    id,
    title: shortText(hook || title || "Untitled clip"),
    hook: hook || title || "Untitled clip",
    score: intelligence?.score ?? analysis?.priorityScore ?? parseNumber(item.performance_score ?? item.score) ?? 0,
    performanceLabel: item.performance_label ?? "decent",
    status: item.review_status === "skipped" ? "held" : READY_PUBLISH_STATUSES.has(publishStatus) ? "approved" : "pending",
    publishStatus,
    thumbnailUrl,
    videoUrl,
    sourceName: item.source_name ?? "RBHQ",
    sourceType: item.source_type ?? "unknown",
    sourceUrl: item.source?.url ?? item.source_url ?? item.source_video_url ?? null,
    sourceChannelId: item.source?.channel_id ?? item.channel_id ?? null,
    sourceExternalId: item.source?.external_id ?? null,
    originalPlatform: item.source?.original_platform ?? null,
    importBatchId: item.source?.import_batch_id ?? null,
    sport: item.sport ?? null,
    league: item.league ?? null,
    durationSeconds: parseNumber(item.duration_seconds),
    aspectRatio: item.aspect_ratio ?? "9:16",
    recommendedHook: item.recommended_hook ?? null,
    moderationNotes,
    riskFlags: Array.isArray(item.risk_flags) ? item.risk_flags : [],
    analysis,
    intelligence,
    verticalReadiness: item.vertical_readiness ?? DEFAULT_VERTICAL_READINESS,
    packageReadiness: normalizePackageReadiness(item.package_readiness),
    approvedAt: item.approved_at ?? null,
  };
}

function mapPublishItem(item: ReviewClipApi & { export_package: PublishExportPackage }): PublishQueueItem {
  const clip = mapApiClip(item);

  return {
    ...(clip ?? {
      id: item.id,
      title: shortText(item.hook || item.title || "Untitled clip"),
      hook: item.hook || item.title || "Untitled clip",
      score: parseNumber(item.performance_score ?? item.score) ?? 0,
      performanceLabel: item.performance_label ?? "decent",
      status: "approved" as const,
      publishStatus: "ready_for_manual_publish" as const,
      thumbnailUrl: item.thumbnail_url ?? null,
      videoUrl: item.cdn_url ?? item.video_url ?? item.local_url ?? item.tiktok_url ?? item.source_video_url ?? null,
      sourceName: item.source_name ?? "RBHQ",
      sourceType: item.source_type ?? "unknown",
      sourceUrl: item.source?.url ?? item.source_url ?? item.source_video_url ?? null,
      sourceChannelId: item.source?.channel_id ?? item.channel_id ?? null,
      sourceExternalId: item.source?.external_id ?? null,
      originalPlatform: item.source?.original_platform ?? null,
      importBatchId: item.source?.import_batch_id ?? null,
      sport: item.sport ?? null,
      league: item.league ?? null,
      durationSeconds: parseNumber(item.duration_seconds),
      aspectRatio: item.aspect_ratio ?? "9:16",
      recommendedHook: item.recommended_hook ?? null,
      moderationNotes: Array.isArray(item.moderation_notes) ? item.moderation_notes : [],
      riskFlags: Array.isArray(item.risk_flags) ? item.risk_flags : [],
      analysis: readTikTokAnalysis(item.moderation_notes, item.tiktok_analysis),
      intelligence: readRBHQIntelligenceV1(
        item.moderation_notes,
        item.intelligence_v1,
        readTikTokAnalysis(item.moderation_notes, item.tiktok_analysis),
      ),
      verticalReadiness: item.vertical_readiness ?? DEFAULT_VERTICAL_READINESS,
      packageReadiness: normalizePackageReadiness(item.package_readiness),
      approvedAt: item.approved_at ?? null,
    }),
    status: "approved",
    publishStatus: readMetricoolStatus(item.moderation_notes, item.publish_status ?? "ready_for_manual_publish"),
    exportPackage: item.export_package,
  };
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "0:15";
  const rounded = Math.max(0, Math.floor(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function formatApprovedAt(value: string | null) {
  if (!value) return "Just approved";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function saveJson(name: string, payload: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function preloadClipMedia(clip: Clip | null) {
  if (typeof window === "undefined" || !clip) return;
  if (clip.thumbnailUrl) {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "high";
    image.src = clip.thumbnailUrl;
  }
  if (clip.videoUrl) {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = clip.videoUrl;
    video.load();
  }
}

export default function OperatorApp({ initialTab = "queue" }: { initialTab?: AppTab }) {
  const [tab, setTab] = useState<AppTab>(initialTab);
  const [user, setUser] = useState<User | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [publishItems, setPublishItems] = useState<PublishQueueItem[]>([]);
  const [sources, setSources] = useState<SourceFilterOption[]>([]);
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
  const [dailyPlanLoading, setDailyPlanLoading] = useState(false);
  const [dailyPlanError, setDailyPlanError] = useState("");
  const [source, setSource] = useState("");
  const [queueMode, setQueueMode] = useState<QueueMode>("pending");
  const [urgencyFilter, setUrgencyFilter] = useState<IntelligenceUrgency | "">("");
  const [scoreThreshold, setScoreThreshold] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [exitDirections, setExitDirections] = useState<Record<string, DecisionAction>>({});
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const optimisticIdsRef = useRef(new Set<string>());
  const selectedChannel = useMemo(() => {
    const channels = user?.channels ?? [];
    return channels.find((channel) => channel.id === selectedChannelId) ?? channels[0] ?? null;
  }, [selectedChannelId, user]);
  const visibleSources = useMemo(
    () => sources.filter((item) => !item.channel_id || item.channel_id === selectedChannelId),
    [selectedChannelId, sources],
  );
  const channelTheme = themeForChannel(selectedChannel?.label ?? user?.channelLabel);

  async function handleLogout() {
    try {
      const headers = await getCsrfHeaders();
      await fetch("/api/logout", { method: "POST", headers });
    } catch {
      // best-effort
    }
    window.location.href = "/login";
  }

  const activeClip = useMemo(
    () => clips.find((clip) => clip.id === activeId) ?? clips[0] ?? null,
    [activeId, clips],
  );

  const fetchSources = useCallback(async () => {
    const response = await fetch("/api/clips/sources", { cache: "no-store" });
    const json = await readApiJson(response, "Sources unavailable");
    if (!response.ok || !json.ok) throw new Error(json.error || "Sources unavailable");
    setSources(json.data as SourceFilterOption[]);
  }, []);

  const fetchQueue = useCallback(async (
    channelId: string,
    selectedSource: string,
    mode: QueueMode,
    selectedUrgency: IntelligenceUrgency | "",
    minScore: number,
  ) => {
    if (!channelId) {
      setClips([]);
      setActiveId(null);
      return;
    }

    const params = new URLSearchParams({
      channel_id: channelId,
      limit: "60",
      status: mode,
    });
    if (selectedSource) params.set("source_name", selectedSource);
    if (selectedUrgency) params.set("urgency", selectedUrgency);
    if (minScore > 0) params.set("min_score", String(minScore));

    const response = await fetch(`/api/clips?${params.toString()}`, { cache: "no-store" });
    const json = await readApiJson(response, "Queue unavailable");
    if (!response.ok || !json.ok) throw new Error(json.error || "Queue unavailable");

    const seen = new Set<string>();
    const queueItems: unknown[] = Array.isArray(json.data) ? json.data : [];
    const mapped = queueItems
      .filter((item) => {
        // Client-side guard: reject clips that don't belong to this operator's channel
        const raw = item as ReviewClipApi;
        return !raw.channel_id || raw.channel_id === channelId;
      })
      .map((item) => mapApiClip(item as ReviewClipApi))
      .filter((clip): clip is Clip => Boolean(clip))
      .filter((clip) => {
        const key = clip.videoUrl || clip.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const visible = mapped.filter((clip) => !optimisticIdsRef.current.has(clip.id));
    setClips(visible);
    setActiveId((current) => current && visible.some((clip) => clip.id === current) ? current : visible[0]?.id ?? null);
  }, []);

  const fetchPublishQueue = useCallback(async () => {
    const response = await fetch("/api/publish-queue", { cache: "no-store" });
    const json = await readApiJson(response, "Publish queue unavailable");
    if (!response.ok || !json.ok) throw new Error(json.error || "Publish queue unavailable");
    const publishItems: unknown[] = Array.isArray(json.data) ? json.data : [];
    setPublishItems(
      publishItems
        .filter((item): item is ReviewClipApi & { export_package: PublishExportPackage } =>
          Boolean((item as { export_package?: unknown } | null)?.export_package),
        )
        .map(mapPublishItem),
    );
  }, []);

  const fetchDailyPlan = useCallback(async (showLoading = false) => {
    if (showLoading) setDailyPlanLoading(true);
    try {
      const response = await fetch("/api/intelligence/daily-plan", { cache: "no-store" });
      const json = await readApiJson(response, "Daily plan unavailable");
      if (!response.ok || !json.ok) throw new Error(json.error || "Daily plan unavailable");
      setDailyPlan(json.data as DailyPlan);
      setDailyPlanError("");
    } catch (planError) {
      setDailyPlanError(planError instanceof Error ? planError.message : "Daily plan unavailable");
    } finally {
      if (showLoading) setDailyPlanLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    async function boot() {
      setLoading(true);
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        const json = await response.json();
        if (!alive) return;
        if (!json.ok || !json.user) {
          setAuthRequired(true);
          return;
        }

        const nextUser = json.user as User;
        const channels = Array.isArray(nextUser.channels) && nextUser.channels.length > 0
          ? nextUser.channels
          : [{
              id: nextUser.channelDbId,
              channel: nextUser.channel ?? "sports",
              label: nextUser.channelLabel,
              name: nextUser.channelLabel,
              handle: nextUser.handle,
            }];
        const initialChannelId = channels[0]?.id ?? "";
        setUser({ ...nextUser, channels });
        setSelectedChannelId(initialChannelId);
        await fetchQueue(initialChannelId, "", "pending", "", 0);
        await Promise.allSettled([fetchPublishQueue(), fetchSources(), fetchDailyPlan()]);
        setError("");
      } catch (bootError) {
        if (alive) setError(bootError instanceof Error ? bootError.message : "Queue unavailable");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void boot();
    return () => {
      alive = false;
    };
  }, [fetchDailyPlan, fetchQueue, fetchPublishQueue, fetchSources]);

  useEffect(() => {
    if (!user || !selectedChannelId) return;
    const currentChannelId = selectedChannelId;
    let alive = true;

    async function refresh() {
      try {
        await fetchQueue(currentChannelId, source, queueMode, urgencyFilter, scoreThreshold);
        await Promise.allSettled([fetchPublishQueue(), fetchSources(), fetchDailyPlan()]);
        if (alive) setError("");
      } catch (refreshError) {
        if (alive) setError(refreshError instanceof Error ? refreshError.message : "Live refresh failed");
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [fetchDailyPlan, fetchQueue, fetchPublishQueue, fetchSources, queueMode, scoreThreshold, selectedChannelId, source, urgencyFilter, user]);

  function handleChannelChange(channelId: string) {
    if (channelId === selectedChannelId) return;
    optimisticIdsRef.current.clear();
    setSelectedChannelId(channelId);
    setSource("");
    setUrgencyFilter("");
    setScoreThreshold(0);
    setActiveId(null);
    setClips([]);
  }

  async function moderateClip(id: string, action: DecisionAction) {
    if (action === "needs_clip_prep" || action === "create_mac_mini_package" || action === "stage_in_tiktok") {
      const clip = clips.find((item) => item.id === id);
      setToast(action === "needs_clip_prep" ? "clip prep queued" : action === "stage_in_tiktok" ? "staging requested" : "package requested");
      try {
        const csrfHeaders = await getCsrfHeaders();
        const response = await fetch(`/api/posts/${id}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...csrfHeaders },
          body: JSON.stringify({
            action,
            time_to_decision: 1.2,
            package_id: action === "stage_in_tiktok" ? clip?.packageReadiness.macMiniPackageId : undefined,
          }),
        });
        const json = await readApiJson(response, "action failed");
        if (!response.ok || !json.ok) throw new Error(json.error || "action failed");
        setToast(action === "needs_clip_prep" ? "clip prep refreshed" : action === "stage_in_tiktok" ? "staging queued for Mac mini" : "package ready");
        if (selectedChannelId) await fetchQueue(selectedChannelId, source, queueMode, urgencyFilter, scoreThreshold);
        await fetchPublishQueue();
        void fetchDailyPlan();
      } catch (actionError) {
        setToast(actionError instanceof Error ? actionError.message : "action failed");
      }
      return;
    }

    const restoredClip = clips.find((clip) => clip.id === id);
    let restoreIndex = 0;

    optimisticIdsRef.current.add(id);
    setExitDirections((current) => ({ ...current, [id]: action }));
    setToast(action === "approve" ? "approved" : action === "reject" ? "rejected" : "held");
    setClips((current) => {
      restoreIndex = Math.max(0, current.findIndex((clip) => clip.id === id));
      const next = current.filter((clip) => clip.id !== id);
      setActiveId((active) => active === id ? next[restoreIndex]?.id ?? next[0]?.id ?? null : active);
      return next;
    });

    try {
      const csrfHeaders = await getCsrfHeaders();
      const response = await fetch(`/api/posts/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        body: JSON.stringify({ action, time_to_decision: 1.2 }),
      });
      if (!response.ok) throw new Error("decision failed");

      setToast(action === "approve" ? "approved" : action === "reject" ? "rejected" : "held");
      if (action === "approve") await fetchPublishQueue();
      void fetchDailyPlan();
    } catch {
      optimisticIdsRef.current.delete(id);
      if (restoredClip) {
        setClips((current) => {
          if (current.some((clip) => clip.id === id)) return current;
          const next = [...current];
          next.splice(Math.min(restoreIndex, next.length), 0, { ...restoredClip, status: queueMode === "held" ? "held" : "pending" });
          return next;
        });
        setActiveId(id);
      }
      setToast("Decision failed");
    } finally {
      window.setTimeout(() => {
        setExitDirections((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }, 420);
    }
  }

  async function refreshClipAnalysis(id: string) {
    try {
      const csrfHeaders = await getCsrfHeaders();
      const response = await fetch(`/api/clips/${id}/analysis`, {
        method: "POST",
        headers: csrfHeaders,
      });
      if (!response.ok) throw new Error("refresh failed");
      if (selectedChannelId) await fetchQueue(selectedChannelId, source, queueMode, urgencyFilter, scoreThreshold);
      await fetchPublishQueue();
      void fetchDailyPlan();
      setToast("ranking refreshed");
    } catch {
      setToast("refresh failed");
    }
  }

  async function sendToTikTokPosting(id: string) {
    try {
      const csrfHeaders = await getCsrfHeaders();
      const response = await fetch(`/api/tiktok-post-jobs/${id}`, {
        method: "POST",
        headers: csrfHeaders,
      });
      if (!response.ok) throw new Error("handoff failed");
      await fetchPublishQueue();
      setToast("sent to TikTok queue");
    } catch {
      setToast("TikTok queue failed");
    }
  }

  if (loading || !user) {
    return (
      <main className="rbhq-system min-h-dvh w-full overflow-x-hidden bg-[var(--rb-bg)] text-[var(--rb-text)]">
        <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col items-center justify-center px-8 text-center">
          {authRequired ? (
            <>
              <p className="text-[15px] font-medium uppercase tracking-[0.42em] text-[var(--rb-text)]">RBHQ</p>
              <span className="mt-5 h-px w-12 bg-[var(--rb-accent)]" />
              <p className="mt-8 max-w-[240px] text-[13px] leading-5 text-[var(--rb-muted)]">
                operator access required
              </p>
              <a href="/login" className="mt-8 text-[14px] lowercase text-[var(--rb-text)] underline decoration-[var(--rb-accent)] decoration-1 underline-offset-8 active:opacity-60">
                enter
              </a>
            </>
          ) : (
            <LoadingDeck />
          )}
        </div>
      </main>
    );
  }

  return (
    <main className={`rbhq-system rbhq-theme-${channelTheme} min-h-dvh w-full overflow-x-hidden bg-[var(--rb-bg)] text-[var(--rb-text)]`}>
      <div className="operator-phone-shell relative mx-auto min-h-dvh w-full max-w-[520px] overflow-x-hidden">
        <AnimatePresence mode="wait">
          {tab === "dashboard" && (
            <DashboardScreen
              key="dashboard"
              user={user}
              clips={clips}
              publishItems={publishItems}
              sources={sources}
              channels={user.channels ?? []}
              selectedChannelId={selectedChannelId}
              onSelectChannel={handleChannelChange}
              onNavigate={setTab}
            />
          )}
          {tab === "queue" && (
            <QueueScreen
              key="queue"
              clips={clips}
              channels={user.channels ?? []}
              selectedChannelId={selectedChannelId}
              error={error}
              queueMode={queueMode}
              sources={visibleSources}
              selectedSource={source}
              urgencyFilter={urgencyFilter}
              scoreThreshold={scoreThreshold}
              onSelectChannel={handleChannelChange}
              onQueueMode={setQueueMode}
              onSelectSource={setSource}
              onUrgencyFilter={setUrgencyFilter}
              onScoreThreshold={setScoreThreshold}
              onActive={setActiveId}
              onModerate={moderateClip}
              onRefreshAnalysis={refreshClipAnalysis}
              exitDirections={exitDirections}
            />
          )}
          {tab === "publish" && (
            <PublishScreen
              key="publish"
              items={publishItems}
              onCopy={(message) => setToast(message)}
              onSendToTikTok={sendToTikTokPosting}
            />
          )}
          {tab === "plan" && (
            <DailyPlanScreen
              key="plan"
              plan={dailyPlan}
              loading={dailyPlanLoading}
              error={dailyPlanError}
              onRefresh={() => void fetchDailyPlan(true)}
            />
          )}
          {tab === "sources" && (
            <SourcesScreen
              key="sources"
              sources={sources}
              selectedSource={source}
              selectedChannelId={selectedChannelId}
              userChannelIds={(user?.channels ?? []).map((ch) => ch.id)}
              onSelectSource={(value) => {
                setSource(value);
                setTab("queue");
              }}
            />
          )}
          {tab === "profile" && (
            <ProfileScreen
              key="profile"
              user={user}
              onLogout={handleLogout}
            />
          )}
        </AnimatePresence>

        <BottomNav active={tab} onChange={setTab} />
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onAnimationComplete={() => window.setTimeout(() => setToast(""), 720)}
              className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+104px)] z-[70] -translate-x-1/2 rounded-full border border-black/[0.10] bg-white px-4 py-2 text-[var(--rb-text)] shadow-[0_8px_32px_rgba(0,0,0,0.14)] backdrop-blur-xl"
            >
              <div className="flex items-center gap-2">
                {toast === "approved" && <Check className="h-4 w-4 text-[var(--rb-accent)]" strokeWidth={1.8} />}
                <p className="text-[13px] font-normal lowercase tracking-[-0.01em]">{toast}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <span className="sr-only">{activeClip?.id}</span>
      </div>
    </main>
  );
}

function LoadingDeck() {
  return (
    <div className="grid min-h-[60dvh] w-full place-items-center">
      <div className="flex flex-col items-center">
        <p className="text-[15px] font-medium uppercase tracking-[0.42em] text-[var(--rb-text)]">RBHQ</p>
        <span className="mt-5 h-px w-12 bg-[var(--rb-accent)]" />
        <p className="mt-7 text-[12px] lowercase text-[var(--rb-muted)] motion-safe:animate-[rbhq-live-breathe_1.8s_ease-in-out_infinite]">
          syncing clips
        </p>
      </div>
    </div>
  );
}

function QueueScreen({
  clips,
  channels,
  selectedChannelId,
  error,
  queueMode,
  sources,
  selectedSource,
  urgencyFilter,
  scoreThreshold,
  onSelectChannel,
  onQueueMode,
  onSelectSource,
  onUrgencyFilter,
  onScoreThreshold,
  onActive,
  onModerate,
  onRefreshAnalysis,
  exitDirections,
}: {
  clips: Clip[];
  channels: UserChannel[];
  selectedChannelId: string;
  error: string;
  queueMode: QueueMode;
  sources: SourceFilterOption[];
  selectedSource: string;
  urgencyFilter: IntelligenceUrgency | "";
  scoreThreshold: number;
  onSelectChannel: (channelId: string) => void;
  onQueueMode: (value: QueueMode) => void;
  onSelectSource: (value: string) => void;
  onUrgencyFilter: (value: IntelligenceUrgency | "") => void;
  onScoreThreshold: (value: number) => void;
  onActive: (id: string) => void;
  onModerate: (id: string, action: DecisionAction) => void;
  onRefreshAnalysis: (id: string) => void;
  exitDirections: Record<string, DecisionAction>;
}) {
  const [reviewId, setReviewId] = useState<string | null>(null);
  const reviewClip = reviewId != null ? (clips.find((c) => c.id === reviewId) ?? null) : null;
  const hasActiveFilter = Boolean(selectedSource || urgencyFilter || scoreThreshold > 0);

  const nextClip = useMemo(() => {
    if (!reviewClip) return null;
    const idx = clips.findIndex((c) => c.id === reviewClip.id);
    return clips[idx + 1] ?? clips[idx === 0 ? 1 : 0] ?? null;
  }, [reviewClip, clips]);

  useEffect(() => {
    if (reviewClip) preloadClipMedia(nextClip);
  }, [nextClip, reviewClip]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || !reviewClip) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (key === "a") { event.preventDefault(); onModerate(reviewClip.id, "approve"); setReviewId(null); }
      else if (key === "r") { event.preventDefault(); onModerate(reviewClip.id, "reject"); setReviewId(null); }
      else if (key === "h" || key === "s") { event.preventDefault(); onModerate(reviewClip.id, "hold"); setReviewId(null); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reviewClip, onModerate]);

  function handleModerate(id: string, action: DecisionAction) {
    onModerate(id, action);
    setReviewId(null);
  }

  if (reviewClip) {
    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="flex w-full bg-[var(--rb-bg)]"
        style={{ height: "100dvh", flexDirection: "column" }}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--rb-line)] bg-[var(--rb-bg)] px-5 pb-3 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
          <button
            type="button"
            onClick={() => setReviewId(null)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--rb-line)] bg-[var(--rb-surface)] text-base text-[var(--rb-text)]"
            aria-label="Back to queue list"
          >
            ←
          </button>
          <h1 className="text-[17px] font-black text-[var(--rb-text)]">Review</h1>
          <p className="ml-auto text-[12px] text-[var(--rb-muted)]">{clips.length} in queue</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+104px)] pt-3">
          <AnimatePresence initial={false} mode="popLayout">
            <QueueClipCard
              key={reviewClip.id}
              clip={reviewClip}
              active
              exitDirection={exitDirections[reviewClip.id]}
              nextVideoUrl={nextClip?.videoUrl ?? null}
              remainingCount={clips.length}
              onActive={onActive}
              onModerate={handleModerate}
              onRefreshAnalysis={onRefreshAnalysis}
            />
          </AnimatePresence>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex w-full bg-[var(--rb-bg)]"
      style={{ height: "100dvh", flexDirection: "column" }}
    >
      <header className="shrink-0 border-b border-[var(--rb-line)] px-5 pb-3 pt-[calc(env(safe-area-inset-top,0px)+58px)]">
        <h1 className="text-[24px] font-black text-[var(--rb-text)]">Queue</h1>
      </header>

      {channels.length > 1 && (
        <div className="hide-scrollbar flex shrink-0 gap-2 overflow-x-auto border-b border-[var(--rb-line)] px-5 py-3">
          {channels.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => onSelectChannel(ch.id)}
              className={`h-9 shrink-0 rounded-full border px-4 text-[12px] font-bold transition active:scale-95 ${
                selectedChannelId === ch.id
                  ? "border-[var(--rb-text)] bg-[var(--rb-text)] text-white"
                  : "border-[var(--rb-line)] bg-[var(--rb-surface)] text-[var(--rb-text)]"
              }`}
            >
              {laneMetaForChannel(ch.label).emoji} {displayChannelLabel(ch.label)}
            </button>
          ))}
        </div>
      )}

      <div className="hide-scrollbar flex shrink-0 gap-2 overflow-x-auto border-b border-[var(--rb-line)] px-5 py-3">
        <button
          type="button"
          onClick={() => onQueueMode("pending")}
          className={`h-8 shrink-0 rounded-full border px-4 text-[11.5px] font-bold transition active:scale-95 ${
            queueMode === "pending"
              ? "border-[var(--rb-text)] bg-[var(--rb-text)] text-white"
              : "border-[var(--rb-line)] bg-[var(--rb-surface)] text-[var(--rb-muted)]"
          }`}
        >
          Needs Review{queueMode === "pending" && clips.length > 0 ? ` (${clips.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => onQueueMode("held")}
          className={`h-8 shrink-0 rounded-full border px-4 text-[11.5px] font-bold transition active:scale-95 ${
            queueMode === "held"
              ? "border-[var(--rb-text)] bg-[var(--rb-text)] text-white"
              : "border-[var(--rb-line)] bg-[var(--rb-surface)] text-[var(--rb-muted)]"
          }`}
        >
          Held{queueMode === "held" && clips.length > 0 ? ` (${clips.length})` : ""}
        </button>
      </div>

      <div className="shrink-0 border-b border-[var(--rb-line)] px-5 py-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0">
            <span className="sr-only">Source filter</span>
            <select
              value={selectedSource}
              onChange={(event) => onSelectSource(event.target.value)}
              className="h-10 w-full rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-surface)] px-3 text-[12px] font-bold text-[var(--rb-text)] outline-none"
            >
              <option value="">All sources</option>
              {sources.map((item) => (
                <option key={`${item.source_name}-${item.source_type}`} value={item.source_name}>
                  {item.source_name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="sr-only">Urgency filter</span>
            <select
              value={urgencyFilter}
              onChange={(event) => onUrgencyFilter(event.target.value as IntelligenceUrgency | "")}
              className="h-10 w-full rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-surface)] px-3 text-[12px] font-bold text-[var(--rb-text)] outline-none"
            >
              <option value="">All urgency</option>
              <option value="post_now">Post now</option>
              <option value="today">Today</option>
              <option value="evergreen">Evergreen</option>
              <option value="hold">Hold</option>
            </select>
          </label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {[0, 65, 75, 85].map((score) => (
            <button
              key={score}
              type="button"
              onClick={() => onScoreThreshold(score)}
              className={`h-8 flex-1 rounded-full border text-[11px] font-black transition active:scale-95 ${
                scoreThreshold === score
                  ? "border-[var(--rb-text)] bg-[var(--rb-text)] text-white"
                  : "border-[var(--rb-line)] bg-[var(--rb-surface)] text-[var(--rb-muted)]"
              }`}
            >
              {score === 0 ? "Any score" : `${score}+`}
            </button>
          ))}
        </div>
      </div>

      {error && clips.length > 0 && (
        <p className="shrink-0 px-5 py-1 text-center text-[11px] lowercase text-[var(--rb-muted)]">reconnecting</p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+104px)] pt-3">
        {error && clips.length === 0 ? (
          <QueueEmptyState title="syncing clips" body="reconnecting live sources" />
        ) : clips.length === 0 ? (
          <QueueEmptyState
            title={hasActiveFilter ? "no candidates" : "queue empty"}
            body={
              queueMode === "held"
                ? "held clips stay here until you approve or reject them"
                : hasActiveFilter
                ? "no clips match the selected source, urgency, and score filters"
                : "new clips will appear here as sources sync"
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {clips.map((clip) => (
              <QueueListCard key={clip.id} clip={clip} onReview={setReviewId} />
            ))}
          </div>
        )}
      </div>
    </motion.section>
  );
}


function QueueClipCard({
  clip,
  active,
  onActive,
  onModerate,
  onRefreshAnalysis,
  exitDirection,
  nextVideoUrl,
  remainingCount,
}: {
  clip: Clip;
  active: boolean;
  onActive: (id: string) => void;
  onModerate: (id: string, action: DecisionAction) => void;
  onRefreshAnalysis: (id: string) => void;
  exitDirection?: DecisionAction;
  nextVideoUrl: string | null;
  remainingCount: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(false);
  const x = useMotionValue(0);
  const smoothX = useSpring(x, { stiffness: 620, damping: 40, mass: 0.5 });
  const rotate = useTransform(smoothX, [-180, 0, 180], [-3.5, 0, 3.5]);
  const scale = useTransform(smoothX, [-190, 0, 190], [0.985, 1, 0.988]);
  const mediaY = useTransform(smoothX, [-180, 0, 180], [3, 0, 3]);
  const approveOpacity = useTransform(smoothX, [32, 142], [0, 0.16]);
  const rejectOpacity = useTransform(smoothX, [-132, -28], [0.13, 0]);
  const hasCandidate = Boolean(clip.packageReadiness.candidateId);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && entry.intersectionRatio > 0.72) onActive(clip.id);
    }, { threshold: [0.72] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [clip.id, onActive]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active || paused || (clip.status !== "pending" && clip.status !== "held")) {
      video.pause();
      return;
    }
    void video.play().catch(() => null);
  }, [active, paused, clip.status]);

  const canModerate = clip.status === "pending" || clip.status === "held";
  const staging = clip.packageReadiness.tiktokStaging;
  const canRetryStaging = (staging.status === "blocked" || staging.status === "failed") &&
    clip.packageReadiness.clipPrepReady &&
    clip.packageReadiness.localRenderAttached &&
    !staging.readyForManualPost;
  const canStageInTikTok = Boolean(clip.packageReadiness.macMiniPackageId) &&
    staging.status !== "requested" &&
    (staging.eligible || canRetryStaging);
  const stagingTitle = isTikTokLoginBlocked(staging)
    ? "Retry dry-run after account access is restored"
    : canStageInTikTok
    ? "Stage in TikTok"
    : staging.blocker ?? "Staging unavailable";

  return (
    <div>
      {/* Clip card — draggable, bounded to card dimensions */}
      <motion.div
        ref={ref}
        style={{ x, rotate, scale, aspectRatio: "9/16", maxHeight: "62dvh" }}
        drag={canModerate ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.13}
        onDragEnd={(_, info) => {
          if (!canModerate) return;
          if (info.offset.x > 112 || info.velocity.x > 700) onModerate(clip.id, "approve");
          if (info.offset.x < -84 || info.velocity.x < -560) onModerate(clip.id, "reject");
        }}
        initial={{ opacity: 0.98, y: 8, scale: 0.992 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{
          x: exitDirection === "reject" ? -540 : 540,
          rotate: exitDirection === "reject" ? -6 : exitDirection === "hold" ? 0 : 6,
          opacity: 0,
          scale: exitDirection === "approve" ? 0.965 : exitDirection === "hold" ? 0.97 : 0.94,
          transition: exitDirection === "approve"
            ? { type: "spring", stiffness: 760, damping: 36, mass: 0.5 }
            : { duration: 0.13, ease: [0.4, 0, 1, 1] },
        }}
        transition={{ type: "spring", stiffness: 560, damping: 38, mass: 0.55 }}
        className="relative w-full cursor-grab overflow-hidden rounded-[24px] active:cursor-grabbing"
        onClick={() => setPaused((value) => !value)}
      >
        <article className="relative h-full overflow-hidden bg-[#0a0a0a]">
          <motion.div style={{ opacity: approveOpacity }} className="absolute inset-0 z-10 bg-[var(--rb-accent)]" />
          <motion.div style={{ opacity: rejectOpacity }} className="absolute inset-0 z-10 bg-white grayscale" />

          <motion.div style={{ y: mediaY }} className="absolute inset-0">
            {clip.thumbnailUrl && (
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${clip.thumbnailUrl})` }} />
            )}
            {clip.videoUrl && (
              <video
                ref={videoRef}
                src={clip.videoUrl}
                poster={clip.thumbnailUrl ?? undefined}
                muted
                playsInline
                loop
                preload={active ? "auto" : "metadata"}
                className="absolute inset-0 h-full w-full bg-[#111] object-cover"
              />
            )}
          </motion.div>
          {nextVideoUrl && <video src={nextVideoUrl} muted playsInline preload="auto" aria-hidden className="sr-only" />}
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[52%] bg-gradient-to-t from-black via-black/60 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-5 text-white">
            <p className="text-[11px] font-medium lowercase leading-none text-[var(--rb-accent)]">
              {formatDuration(clip.durationSeconds)}
            </p>
            <h2 className="mt-2 max-w-[88%] text-[clamp(18px,5.5vw,24px)] font-semibold lowercase leading-[1.06] tracking-[-0.02em] [text-shadow:0_2px_18px_rgba(0,0,0,0.72)]">
              {clip.title}
            </h2>
            <p className="mt-2 max-w-[80%] truncate text-[12px] font-normal lowercase leading-5 text-white/62 [text-shadow:0_2px_14px_rgba(0,0,0,0.74)]">
              {clip.sourceName}
              {clip.league ? ` · ${clip.league}` : clip.sport ? ` · ${clip.sport}` : ""}
              {remainingCount > 1 ? ` · ${remainingCount - 1} next` : ""}
              {Math.round(clip.score) > 0 ? ` · score ${Math.round(clip.score)}` : ""}
            </p>
          </div>

          {/* Pause indicator */}
          {paused && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/28">
              <Pause className="h-10 w-10 text-white/72" strokeWidth={1.5} />
            </div>
          )}
        </article>
      </motion.div>

      {/* Action buttons — always visible below the card */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => onModerate(clip.id, "reject")}
          disabled={!canModerate}
          aria-label="Reject clip"
          title="Reject"
          className="grid h-14 w-14 place-items-center rounded-full border border-[var(--rb-line)] bg-[var(--rb-surface)] text-[#e2162b] shadow-sm transition active:scale-90 disabled:opacity-35"
        >
          <X className="h-6 w-6" strokeWidth={2} />
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => onModerate(clip.id, "hold")}
          disabled={!canModerate || clip.status === "held"}
          aria-label="Hold clip for later review"
          title="Hold"
          className="grid h-11 w-11 place-items-center rounded-full border border-[var(--rb-line)] bg-[var(--rb-surface)] text-[var(--rb-muted)] shadow-sm transition active:scale-90 disabled:opacity-35"
        >
          <Pause className="h-5 w-5" strokeWidth={1.8} />
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => onModerate(clip.id, "approve")}
          disabled={!canModerate}
          aria-label="Approve clip for publishing"
          title="Approve"
          className="grid h-14 w-14 place-items-center rounded-full bg-[var(--rb-accent)] text-white shadow-[0_6px_24px_rgba(226,22,43,0.28)] transition active:scale-90 disabled:opacity-35"
        >
          <Flame className="h-6 w-6" strokeWidth={1.8} />
        </motion.button>
      </div>
      {canModerate && (
        <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--rb-faint)]">swipe or tap to decide</p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onModerate(clip.id, "needs_clip_prep")}
          disabled={!hasCandidate}
          className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-surface)] px-3 text-[11px] font-black text-[var(--rb-text)] active:scale-[0.98] disabled:opacity-45"
        >
          <ListChecks className="h-4 w-4" strokeWidth={1.8} />
          Clip Prep
        </button>
        <button
          type="button"
          onClick={() => onModerate(clip.id, "create_mac_mini_package")}
          disabled={!hasCandidate}
          className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-surface)] px-3 text-[11px] font-black text-[var(--rb-text)] active:scale-[0.98] disabled:opacity-45"
        >
          <Download className="h-4 w-4" strokeWidth={1.8} />
          Mac mini
        </button>
        <button
          type="button"
          onClick={() => onModerate(clip.id, "stage_in_tiktok")}
          disabled={!canStageInTikTok}
          title={stagingTitle}
          className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-surface)] px-2 text-[10.5px] font-black text-[var(--rb-text)] active:scale-[0.98] disabled:opacity-45"
        >
          <Send className="h-4 w-4" strokeWidth={1.8} />
          Stage
        </button>
      </div>
      <ClipIntelligencePanel clip={clip} onRefreshAnalysis={onRefreshAnalysis} />
    </div>
  );
}

function rankTone(label: DisplayRankLabel | undefined) {
  if (label === "must_post" || label === "Hot") return "bg-[#FFF1EC] text-[#E2162B] border-[#E2162B]/20";
  if (label === "strong" || label === "Solid") return "bg-[#ECFDF5] text-[#128A49] border-[#128A49]/20";
  if (label === "solid" || label === "Hold") return "bg-[#FFFBEB] text-[#B45309] border-[#B45309]/20";
  return "bg-[#FFF1F2] text-[#DC2626] border-[#DC2626]/20";
}

function formatRankLabel(label: DisplayRankLabel | undefined) {
  if (!label) return "Hold";
  if (label === "must_post") return "Must post";
  if (label === "low_priority") return "Low priority";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatReasonTag(tag: ReasonTag) {
  return tag.replace(/_/g, " ");
}

function formatUrgencyLabel(value: IntelligenceUrgency | undefined) {
  if (value === "post_now") return "Post now";
  if (value === "today") return "Today";
  if (value === "evergreen") return "Evergreen";
  if (value === "hold") return "Hold";
  return "Unranked";
}

function dailyPlanHasContent(plan: DailyPlan | null) {
  if (!plan) return false;
  return (
    (plan.topClipsToPostNow ?? []).length > 0 ||
    (plan.strongAlternates ?? []).length > 0 ||
    (plan.holdOrLowPriority ?? []).length > 0 ||
    (plan.sourceCandidates ?? []).length > 0 ||
    (plan.laneBalanceNotes ?? []).length > 0 ||
    (plan.suggestedPostingOrder ?? []).length > 0
  );
}

function dailyPlanClipKey(prefix: string, clip: DailyPlanClip, index: number) {
  return `${prefix}-${clip.id ?? `${clip.title}-${index}`}`;
}

function verticalStatusLabel(readiness: VerticalReadiness) {
  if (readiness.verticalStatus === "vertical_ready") return "vertical ready";
  if (readiness.verticalStatus === "needs_resize") return "needs resize";
  if (readiness.verticalStatus === "blocked_wrong_format") return "wrong format";
  return "unknown format";
}

function verticalStatusTone(status: VerticalStatus) {
  if (status === "vertical_ready") return "bg-[#ECFDF5] text-[#128A49] border-[#128A49]/20";
  if (status === "needs_resize") return "bg-[#FFFBEB] text-[#B45309] border-[#B45309]/20";
  if (status === "blocked_wrong_format") return "bg-[#FFF1F2] text-[#DC2626] border-[#DC2626]/20";
  return "bg-[#F5F5F5] text-[#6F6A60] border-[var(--rb-line)]";
}

function readinessTone(ready: boolean, blocked = false, neutral = false) {
  if (ready) return "bg-[#ECFDF5] text-[#128A49] border-[#128A49]/20";
  if (blocked) return "bg-[#FFF1F2] text-[#DC2626] border-[#DC2626]/20";
  if (neutral) return "bg-[#F5F5F5] text-[#6F6A60] border-[var(--rb-line)]";
  return "bg-[#FFFBEB] text-[#B45309] border-[#B45309]/20";
}

function clipPrepLabel(readiness: PackageReadiness) {
  if (readiness.clipPrepStatus === "ready") return `Clip Prep ready${readiness.clipPrepConfidence ? ` · ${readiness.clipPrepConfidence}` : ""}`;
  if (readiness.clipPrepStatus === "metadata_only") return `Metadata-only Prep${readiness.clipPrepConfidence ? ` · ${readiness.clipPrepConfidence}` : ""}`;
  if (!readiness.candidateId) return "No candidate";
  return "Clip Prep needed";
}

function clipPrepTone(readiness: PackageReadiness) {
  if (!readiness.candidateId) return readinessTone(false, false, true);
  if (readiness.clipPrepStatus === "metadata_only") return readinessTone(false);
  return readinessTone(readiness.clipPrepReady);
}

function macMiniPackageLabel(readiness: PackageReadiness) {
  if (!readiness.candidateId) return "No package candidate";
  if (!readiness.macMiniPackageId) return "Package needed";
  if (readiness.macMiniPackageReady) return "Package ready";
  return `Package ${readiness.macMiniPackageStatus ?? "created"}`;
}

function localRenderLabel(readiness: PackageReadiness) {
  if (!readiness.macMiniPackageId) return "Asset pending";
  if (readiness.localRenderAttached) return "Asset attached";
  if (readiness.localRenderStatus === "invalid") return "Render invalid";
  return "Asset missing";
}

function formatBlockerMessage(value: string | null | undefined) {
  if (!value) return "";
  if (value === "ASSET_MISSING") return "Local rendered asset is missing.";
  if (value === "TIKTOK_LOGIN_REQUIRED") return "TikTok login required on the Mac mini.";
  return value.replace(/_/g, " ");
}

function isTikTokLoginBlocked(staging: TikTokStagingReadiness) {
  return staging.loginBlocked || staging.operatorState === "tiktok_login_blocked" || (staging.status === "blocked" && staging.tikTokSession === "missing");
}

function tiktokStagingLabel(staging: TikTokStagingReadiness) {
  if (staging.readyForManualPost) return "Ready for manual Post";
  if (isTikTokLoginBlocked(staging)) return "Login blocked · prep continues";
  if (staging.tikTokSession === "missing") return "TikTok login required";
  if (staging.status === "requested") return "Staging requested";
  if (staging.status === "blocked") return "Staging blocked";
  if (staging.status === "failed") return "Dry-run failed";
  if (staging.eligible) return "Ready to stage";
  return "Staging unavailable";
}

function stagingTone(staging: TikTokStagingReadiness) {
  if (staging.readyForManualPost) return "bg-[#ECFDF5] text-[#128A49] border-[#128A49]/20";
  if (isTikTokLoginBlocked(staging)) return "bg-[#FFFBEB] text-[#B45309] border-[#B45309]/20";
  if (staging.status === "blocked" || staging.status === "failed") return "bg-[#FFF1F2] text-[#DC2626] border-[#DC2626]/20";
  if (staging.eligible || staging.status === "requested") return "bg-[#FFFBEB] text-[#B45309] border-[#B45309]/20";
  return "bg-[#F5F5F5] text-[#6F6A60] border-[var(--rb-line)]";
}

function formatClipSeconds(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return `${Number(value.toFixed(1))}s`;
}

function QueueReadinessStrip({ readiness }: { readiness: PackageReadiness }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${clipPrepTone(readiness)}`}>
        {clipPrepLabel(readiness)}
      </span>
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${readinessTone(readiness.macMiniPackageReady, false, !readiness.candidateId)}`}>
        {macMiniPackageLabel(readiness)}
      </span>
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${readinessTone(readiness.localRenderAttached, readiness.localRenderStatus === "invalid" || (Boolean(readiness.macMiniPackageId) && !readiness.localRenderAttached), !readiness.macMiniPackageId)}`}>
        {localRenderLabel(readiness)}
      </span>
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${stagingTone(readiness.tiktokStaging)}`}>
        {tiktokStagingLabel(readiness.tiktokStaging)}
      </span>
    </div>
  );
}

function stagingDetailValue(value: string | null | undefined) {
  return value && value.trim() ? value : "not available";
}

function formatStagingTimestamp(value: string | null) {
  if (!value) return "not staged";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function OperatorStagingPanel({ readiness }: { readiness: PackageReadiness }) {
  const staging = readiness.tiktokStaging;
  const blocker = formatBlockerMessage(staging.blocker || staging.error);
  const assetMissing = Boolean(readiness.macMiniPackageId) && !readiness.localRenderAttached;
  const loginBlocked = isTikTokLoginBlocked(staging);
  const rows = [
    ["lane/channel", [staging.laneLabel, staging.channelKey].filter(Boolean).join(" · ")],
    ["package ID", staging.packageId],
    ["local asset", readiness.localAssetPath ? "attached" : "missing"],
    ["package", readiness.macMiniPackageStatus ?? "not created"],
    ["dry-run", staging.status],
    ["TikTok session", staging.tikTokSession],
    ["video staged", staging.videoStaged ? "yes" : "no"],
    ["caption filled", staging.captionFilled ? "yes" : "no"],
    ["staged at", formatStagingTimestamp(staging.stagedAt)],
    ["artifact", staging.screenshotPath],
  ] as const;

  return (
    <div className="mt-3 rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--rb-faint)]">TikTok staging</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${stagingTone(staging)}`}>
          {tiktokStagingLabel(staging)}
        </span>
      </div>
      {staging.readyForManualPost ? (
        <p className="mt-2 text-[13px] font-black text-[#128A49]">Ready for manual Post</p>
      ) : loginBlocked ? (
        <div className="mt-3 rounded-[12px] border border-[#B45309]/20 bg-[#FFFBEB] px-3 py-2">
          <p className="text-[12px] font-black leading-4 text-[#92400E]">TikTok login required — clip prep can continue</p>
          <p className="mt-1 text-[11px] font-bold leading-4 text-[#B45309]">Do not retry login repeatedly.</p>
          <p className="mt-1 text-[11px] font-bold leading-4 text-[#B45309]">Retry dry-run after account access is restored.</p>
          {staging.retryAfterAccessRestored ? (
            <p className="mt-1 text-[10.5px] font-semibold leading-4 text-[#6F6A60]">Package, caption, and local MP4 remain ready for TikTok retry later.</p>
          ) : null}
        </div>
      ) : blocker ? (
        <p className={`mt-2 text-[11.5px] font-semibold leading-4 ${staging.status === "failed" || staging.tikTokSession === "missing" || assetMissing ? "text-[#DC2626]" : "text-[#B45309]"}`}>
          {blocker}
        </p>
      ) : null}
      {(readiness.clipPrepStatus === "metadata_only" || assetMissing || staging.status === "failed" || loginBlocked || staging.tikTokSession === "missing") && (
        <div className="mt-3 flex items-start gap-2 rounded-[12px] border border-[#DC2626]/15 bg-[#FFF1F2] px-3 py-2 text-[#DC2626]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
          <p className="text-[11px] font-bold leading-4">
            {loginBlocked
              ? "Keep reviewing Daily Plan, selecting moments, refreshing Clip Prep, rendering local MP4s, and attaching assets while TikTok access cools down."
              : staging.tikTokSession === "missing"
              ? "TikTok login required locally before staging can continue."
              : staging.status === "failed"
              ? "Dry-run failed; review the Mac mini dry-run error before retrying."
              : assetMissing
              ? "Attach the local rendered MP4 before staging."
              : "Metadata-only Clip Prep needs manual moment verification before cutting."}
          </p>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-[10px] border border-[var(--rb-line)] bg-white px-2.5 py-2">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--rb-faint)]">{label}</p>
            <p className="mt-1 truncate text-[11px] font-bold text-[var(--rb-text)]">{stagingDetailValue(value)}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10.5px] font-semibold leading-4 text-[var(--rb-faint)]">
        Dry-run only. The final TikTok Post button remains manual and unavailable to RBHQ automation.
      </p>
    </div>
  );
}

function ClipPrepDetailPanel({ readiness }: { readiness: PackageReadiness }) {
  const prep = readiness.clipPrep;
  const hasTiming = prep?.suggestedStartSeconds !== null && prep?.suggestedStartSeconds !== undefined &&
    prep?.suggestedEndSeconds !== null && prep?.suggestedEndSeconds !== undefined;
  const stateCopy = !readiness.candidateId
    ? "No persisted candidate is linked to this clip."
    : readiness.clipPrepStatus === "metadata_only"
    ? "Metadata-only prep: verify the strongest moment manually before cutting."
    : readiness.clipPrepReady
    ? "Clip Prep is ready for local render prep."
    : "Refresh Clip Prep before packaging.";

  return (
    <div className="mt-3 rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--rb-faint)]">Clip Prep</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${clipPrepTone(readiness)}`}>
          {clipPrepLabel(readiness)}
        </span>
      </div>
      <p className="mt-2 text-[11.5px] font-semibold leading-4 text-[var(--rb-muted)]">{stateCopy}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-[10px] border border-[var(--rb-line)] bg-white px-2.5 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--rb-faint)]">Start</p>
          <p className="mt-1 text-[11px] font-bold text-[var(--rb-text)]">{formatClipSeconds(prep?.suggestedStartSeconds)}</p>
        </div>
        <div className="rounded-[10px] border border-[var(--rb-line)] bg-white px-2.5 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--rb-faint)]">End</p>
          <p className="mt-1 text-[11px] font-bold text-[var(--rb-text)]">{formatClipSeconds(prep?.suggestedEndSeconds)}</p>
        </div>
        <div className="rounded-[10px] border border-[var(--rb-line)] bg-white px-2.5 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--rb-faint)]">Length</p>
          <p className="mt-1 text-[11px] font-bold text-[var(--rb-text)]">{formatClipSeconds(prep?.suggestedLengthSeconds)}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--rb-faint)]">Opening text</p>
          <p className="mt-1 text-[12px] font-semibold leading-5 text-[var(--rb-text)]">{prep?.openingText || "Opening text will appear after Clip Prep refresh."}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--rb-faint)]">Moment selection</p>
          <p className="mt-1 text-[11.5px] leading-4 text-[var(--rb-muted)]">
            {hasTiming ? `${formatClipSeconds(prep?.suggestedStartSeconds)}-${formatClipSeconds(prep?.suggestedEndSeconds)} selected for the local cut.` : "No timed moment selected yet."}
          </p>
        </div>
        {prep?.clipReason ? (
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--rb-faint)]">Why this moment</p>
            <p className="mt-1 text-[11.5px] leading-4 text-[var(--rb-muted)]">{prep.clipReason}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClipIntelligencePanel({ clip, onRefreshAnalysis }: { clip: Clip; onRefreshAnalysis: (id: string) => void }) {
  const intelligence = clip.intelligence;
  const analysis = clip.analysis;
  const tags = analysis?.reasonTags ?? [];
  const signals = intelligence?.reasons ?? [];
  const score = intelligence?.score ?? analysis?.priorityScore ?? clip.score;
  const rankLabel = intelligence?.rankLabel ?? analysis?.rankLabel;
  const urgency = intelligence?.urgency;
  const vertical = clip.verticalReadiness;
  const sourceLine = [
    clip.sourceName,
    clip.sourceType,
    clip.originalPlatform,
    clip.sourceChannelId ? `channel ${clip.sourceChannelId.slice(0, 8)}` : "",
  ].filter(Boolean).join(" · ");

  return (
    <section className="mt-4 rounded-[18px] border border-[var(--rb-line)] bg-[var(--rb-surface)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--rb-text)] px-2.5 py-1 text-[11px] font-black text-white">
              {Math.round(score)}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${rankTone(rankLabel)}`}>
              {formatRankLabel(rankLabel)}
            </span>
            <span className="rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-2.5 py-1 text-[11px] font-black text-[var(--rb-muted)]">
              {formatUrgencyLabel(urgency)}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${verticalStatusTone(vertical.verticalStatus)}`}>
              {verticalStatusLabel(vertical)}
            </span>
          </div>
          <p className="mt-2 text-[10.5px] font-medium text-[var(--rb-faint)]">
            Required 1080x1920 · 9:16{vertical.width && vertical.height ? ` · found ${vertical.width}x${vertical.height}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRefreshAnalysis(clip.id)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] text-[var(--rb-muted)] active:scale-95"
          aria-label="Refresh ranking and caption"
          title="Refresh ranking and caption"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>

      {(signals.length > 0 || tags.length > 0) && (
        <div className="mt-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--rb-faint)]">Viral signals</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
          {signals.map((signal) => (
            <span key={signal} className="rounded-full border border-[var(--rb-line)] bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--rb-muted)]">
              {signal.replace(/\.$/, "")}
            </span>
          ))}
          {tags.map((tag) => (
            <span key={tag} className="rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-2 py-0.5 text-[10px] font-bold text-[var(--rb-muted)]">
              {formatReasonTag(tag)}
            </span>
          ))}
          </div>
        </div>
      )}

      <div className="mt-3">
        <QueueReadinessStrip readiness={clip.packageReadiness} />
      </div>

      <ClipPrepDetailPanel readiness={clip.packageReadiness} />
      <OperatorStagingPanel readiness={clip.packageReadiness} />

      <div className="mt-3 rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-3 py-2">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--rb-faint)]">Source</p>
        <p className="mt-1 text-[11.5px] font-semibold leading-4 text-[var(--rb-muted)]">{sourceLine || "RBHQ source"}</p>
        {clip.sourceUrl ? (
          <p className="mt-1 truncate text-[10.5px] font-medium text-[var(--rb-faint)]">{clip.sourceUrl}</p>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--rb-faint)]">Why now</p>
          <p className="mt-1 text-[12px] font-semibold leading-5 text-[var(--rb-text)]">{intelligence?.whyNow ?? analysis?.whyNow ?? "Review timing is based on local scoring signals."}</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--rb-faint)]">Operator summary</p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--rb-muted)]">{intelligence?.operatorSummary ?? analysis?.operatorSummary ?? "No analyzer summary stored yet."}</p>
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--rb-faint)]">Hook</p>
        <p className="rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] p-3 text-[12px] font-semibold leading-5 text-[var(--rb-text)]">
          {intelligence?.hook ?? analysis?.hookLine ?? clip.recommendedHook ?? clip.hook}
        </p>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--rb-faint)]">Caption draft</p>
        <p className="text-[12px] leading-5 text-[var(--rb-muted)]">{intelligence?.suggestedCaption ?? analysis?.captionDraft ?? "Caption draft will generate on refresh."}</p>
        {(intelligence?.suggestedHashtags?.length || analysis?.hashtagPack?.length) ? (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--rb-faint)]">Hashtag pack</p>
            <p className="mt-1 text-[11px] font-bold leading-5 text-[var(--rb-muted)]">{(intelligence?.suggestedHashtags ?? analysis?.hashtagPack ?? []).join(" ")}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PublishScreen({
  items,
  onCopy,
  onSendToTikTok,
}: {
  items: PublishQueueItem[];
  onCopy: (message: string) => void;
  onSendToTikTok: (id: string) => void;
}) {
  return (
    <PageShell eyebrow="TikTok" title="Publish" trailing={<Sparkles className="h-5 w-5 text-[#ff4d00]" />}>
      <div className="grid grid-cols-2 gap-3">
        <MetricCard value={String(items.length)} label="Ready clips" />
        <MetricCard value="Local" label="Mac mini route" />
      </div>

      <div className="mt-3 rounded-[18px] border border-[var(--rb-line)] bg-[var(--rb-surface)] px-4 py-3 text-sm font-semibold leading-5 text-[var(--rb-muted)]">
        Approved, captioned, vertical-ready clips can be queued for the Mac mini TikTok posting worker.
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {items.length === 0 ? (
          <EmptyState title="No ready clips" body="Approved clips with captions and vertical-ready video will appear here." />
        ) : items.map((item) => (
          <PublishCard
            key={item.id}
            item={item}
            onCopy={onCopy}
            onSendToTikTok={onSendToTikTok}
          />
        ))}
      </div>
    </PageShell>
  );
}

function PublishCard({
  item,
  onCopy,
  onSendToTikTok,
}: {
  item: PublishQueueItem;
  onCopy: (message: string) => void;
  onSendToTikTok: (id: string) => void;
}) {
  const [hook, setHook] = useState(item.exportPackage.recommended_hook || item.exportPackage.hook);
  const [caption, setCaption] = useState(item.exportPackage.caption);
  const [hashtags, setHashtags] = useState(item.exportPackage.hashtags.join(" "));
  const [saving, setSaving] = useState(false);
  const [savedLabel, setSavedLabel] = useState("");
  const canSendToTikTok = READY_PUBLISH_STATUSES.has(item.publishStatus);
  const vertical = item.verticalReadiness;

  async function saveEditorial() {
    setSaving(true);
    try {
      const csrfHeaders = await getCsrfHeaders();
      const res = await fetch(`/api/metricool-export/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        body: JSON.stringify({
          caption,
          hashtags: hashtags.split(/\s+/).map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        setSavedLabel("Saved");
        setTimeout(() => setSavedLabel(""), 2000);
      } else {
        setSavedLabel("Error");
        setTimeout(() => setSavedLabel(""), 2000);
      }
    } catch {
      setSavedLabel("Error");
      setTimeout(() => setSavedLabel(""), 2000);
    } finally {
      setSaving(false);
    }
  }
  const exportPackage: PublishExportPackage = {
    ...item.exportPackage,
    recommended_hook: hook,
    caption,
    hashtags: hashtags.split(/\s+/).map((tag) => tag.trim()).filter(Boolean),
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-[22px] border border-[var(--rb-line)] bg-[var(--rb-surface)] shadow-sm"
    >
      <div className="grid grid-cols-[104px_1fr] gap-4 p-3">
        <div className="relative h-[148px] overflow-hidden rounded-[16px] bg-[#111]">
          {item.thumbnailUrl && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${item.thumbnailUrl})` }} />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/72 to-transparent" />
          <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-xs font-bold text-white">{formatDuration(item.durationSeconds)}</span>
        </div>
        <div className="min-w-0 py-1 pr-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--rb-accent)]">{item.sourceName}</p>
          <h2 className="mt-1 line-clamp-3 text-lg font-black leading-[1.08] tracking-tight text-[var(--rb-text)]">{item.title}</h2>
          <p className="mt-2 truncate text-xs font-semibold text-[var(--rb-muted)]">{formatApprovedAt(item.approvedAt)}</p>
          <p className="mt-2 w-fit rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--rb-muted)]">
            {publishStatusLabel(item.publishStatus)}
          </p>
          <p className={`mt-2 w-fit rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${verticalStatusTone(vertical.verticalStatus)}`}>
            {verticalStatusLabel(vertical)}
          </p>
        </div>
      </div>

      <div className="border-t border-[var(--rb-line)] px-3 py-3">
        <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--rb-muted)]">Hook</label>
        <input
          value={hook}
          onChange={(event) => setHook(event.target.value)}
          className="mt-2 h-11 w-full rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-3 text-sm font-semibold text-[var(--rb-text)] outline-none focus:border-[var(--rb-accent)]"
        />
        <label className="mt-3 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--rb-muted)]">Caption</label>
        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          rows={4}
          className="mt-2 w-full resize-none rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] p-3 text-sm font-medium leading-5 text-[var(--rb-text)] outline-none focus:border-[var(--rb-accent)]"
        />
        <label className="mt-3 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--rb-muted)]">Hashtags</label>
        <input
          value={hashtags}
          onChange={(event) => setHashtags(event.target.value)}
          className="mt-2 h-11 w-full rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-3 text-sm font-semibold text-[var(--rb-text)] outline-none focus:border-[var(--rb-accent)]"
        />
        <div className="mt-3 grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-2">
          <SmallButton label="Copy caption" onClick={() => void copyText(caption).then(() => onCopy("Caption copied"))}>
            <Copy className="h-4 w-4" />
          </SmallButton>
          <SmallButton label="Copy hashtags" onClick={() => void copyText(hashtags).then(() => onCopy("Tags copied"))}>
            <Hash className="h-4 w-4" />
          </SmallButton>
          <SmallButton label="Export JSON" onClick={() => saveJson(`rbhq-export-${item.id}.json`, exportPackage)}>
            <Download className="h-4 w-4" />
          </SmallButton>
          <button
            type="button"
            onClick={() => onSendToTikTok(item.id)}
            disabled={!canSendToTikTok}
            className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-[var(--rb-accent)] px-3 text-xs font-black text-white active:scale-[0.98] disabled:opacity-45"
            aria-label="Send to TikTok posting queue"
            title="Send to TikTok posting queue"
          >
            <Send className="h-4 w-4" />
            Send
          </button>
        </div>
        <button
          type="button"
          onClick={() => void saveEditorial()}
          disabled={saving}
          className="mt-2 h-10 w-full rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] text-xs font-bold text-[var(--rb-muted)] active:scale-[0.99] disabled:opacity-45"
        >
          {saving ? "Saving…" : savedLabel || "Save caption & hashtags"}
        </button>
      </div>
    </motion.article>
  );
}

function publishStatusLabel(status: PublishStatus) {
  if (status === "metricool_published" || status === "manually_published") return "Posted";
  if (status === "metricool_scheduled") return "Queued";
  if (status === "metricool_failed") return "Failed";
  if (READY_PUBLISH_STATUSES.has(status)) return "Ready";
  return "Not ready";
}

function DailyPlanScreen({
  plan,
  loading,
  error,
  onRefresh,
}: {
  plan: DailyPlan | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const hasContent = dailyPlanHasContent(plan);

  return (
    <PageShell
      eyebrow="Intelligence"
      title="Plan"
      trailing={<ListChecks className="h-5 w-5 text-[#ff4d00]" />}
    >
      <div className="mb-4 flex items-center justify-between rounded-[16px] border border-[var(--rb-line)] bg-[var(--rb-surface)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--rb-muted)]">Daily Content Plan</p>
          <p className="mt-1 text-[12px] font-medium text-[var(--rb-faint)]">
            {plan?.generatedAt ? `Updated ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(plan.generatedAt))}` : "Waiting for rankings"}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] text-[var(--rb-muted)] active:scale-95 disabled:opacity-45"
          aria-label="Refresh daily plan"
          title="Refresh daily plan"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} strokeWidth={1.8} />
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-[16px] border border-[#DC2626]/20 bg-[#FFF1F2] px-4 py-3 text-[12px] font-semibold text-[#DC2626]">
          {error}
        </div>
      )}

      {loading && !plan ? (
        <EmptyState title="Building plan" body="Ranking clips by lane, urgency, and caption potential." />
      ) : !hasContent ? (
        <EmptyState title="No candidates" body="Ranked clips will appear here when queue inventory or source candidates are available." />
      ) : (
        <div className="flex flex-col gap-5">
          <DailyPlanSection title="Top Clips To Post Now" count={(plan?.topClipsToPostNow ?? []).length}>
            <div className="flex flex-col gap-3">
              {(plan?.topClipsToPostNow ?? []).map((clip, index) => (
                <DailyPlanClipCard key={dailyPlanClipKey("top", clip, index)} clip={clip} />
              ))}
            </div>
          </DailyPlanSection>

          <DailyPlanSection title="Strong Alternates" count={(plan?.strongAlternates ?? []).length}>
            <div className="flex flex-col gap-3">
              {(plan?.strongAlternates ?? []).map((clip, index) => (
                <DailyPlanClipCard key={dailyPlanClipKey("alt", clip, index)} clip={clip} />
              ))}
            </div>
          </DailyPlanSection>

          <DailyPlanSection title="Source Candidates" count={(plan?.sourceCandidates ?? []).length}>
            <div className="flex flex-col gap-3">
              {(plan?.sourceCandidates ?? []).map((candidate) => (
                <DailyPlanSourceCandidateCard key={candidate.id} candidate={candidate} />
              ))}
            </div>
          </DailyPlanSection>

          <DailyPlanSection title="Hold / Low Priority" count={(plan?.holdOrLowPriority ?? []).length}>
            <div className="flex flex-col gap-2">
              {(plan?.holdOrLowPriority ?? []).map((clip, index) => (
                <DailyPlanCompactClip key={dailyPlanClipKey("hold", clip, index)} clip={clip} />
              ))}
            </div>
          </DailyPlanSection>

          <DailyPlanSection title="Lane Balance Notes" count={(plan?.laneBalanceNotes ?? []).length}>
            <div className="rounded-[18px] border border-[var(--rb-line)] bg-[var(--rb-surface)] p-4">
              {(plan?.laneBalanceNotes ?? []).length === 0 ? (
                <p className="text-[12px] font-medium leading-5 text-[var(--rb-muted)]">No lane notes yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {(plan?.laneBalanceNotes ?? []).map((note) => (
                    <li key={note} className="text-[12px] font-medium leading-5 text-[var(--rb-muted)]">
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DailyPlanSection>

          <DailyPlanSection title="Suggested Posting Order" count={(plan?.suggestedPostingOrder ?? []).length}>
            <div className="flex flex-col gap-2">
              {(plan?.suggestedPostingOrder ?? []).map((clip, index) => (
                <DailyPlanCompactClip key={dailyPlanClipKey("order", clip, index)} clip={clip} index={index + 1} />
              ))}
            </div>
          </DailyPlanSection>
        </div>
      )}
    </PageShell>
  );
}

function DailyPlanSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--rb-muted)]">{title}</h2>
        <span className="rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-2 py-0.5 text-[10px] font-black text-[var(--rb-muted)]">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[var(--rb-line)] bg-[var(--rb-surface)] px-4 py-5 text-[12px] font-medium text-[var(--rb-muted)]">
          No clips in this group.
        </div>
      ) : children}
    </section>
  );
}

function DailyPlanClipCard({ clip }: { clip: DailyPlanClip }) {
  return (
    <article className="rounded-[18px] border border-[var(--rb-line)] bg-[var(--rb-surface)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--rb-accent)]">
            {clip.sourceName || "RBHQ"} · {clip.lane}
          </p>
          <h3 className="mt-1 line-clamp-2 text-[16px] font-black leading-tight text-[var(--rb-text)]">{clip.title}</h3>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--rb-text)] px-2.5 py-1 text-[11px] font-black text-white">
          {Math.round(clip.score)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-black ${rankTone(clip.rankLabel)}`}>
          {formatRankLabel(clip.rankLabel)}
        </span>
        <span className="rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-2.5 py-1 text-[10.5px] font-bold text-[var(--rb-muted)]">
          {formatUrgencyLabel(clip.urgency)}
        </span>
      </div>

      <p className="mt-3 text-[12px] font-semibold leading-5 text-[var(--rb-text)]">{clip.whyNow || "Ranked from current queue signals."}</p>
      {(clip.reasons ?? []).length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(clip.reasons ?? []).slice(0, 4).map((reason) => (
            <span key={reason} className="rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-2 py-0.5 text-[10px] font-bold text-[var(--rb-muted)]">
              {reason.replace(/\.$/, "")}
            </span>
          ))}
        </div>
      ) : null}
      {clip.operatorSummary ? (
        <p className="mt-2 text-[12px] leading-5 text-[var(--rb-muted)]">{clip.operatorSummary}</p>
      ) : null}
      {clip.suggestedCaption ? (
        <p className="mt-3 rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] p-3 text-[12px] font-semibold leading-5 text-[var(--rb-text)]">
          {clip.suggestedCaption}
        </p>
      ) : null}
      {clip.suggestedHashtags.length > 0 ? (
        <p className="mt-2 text-[11px] font-bold leading-5 text-[var(--rb-muted)]">{clip.suggestedHashtags.join(" ")}</p>
      ) : null}
    </article>
  );
}

function DailyPlanSourceCandidateCard({ candidate }: { candidate: DailyPlanSourceCandidate }) {
  return (
    <article className="rounded-[18px] border border-[var(--rb-line)] bg-[var(--rb-surface)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--rb-accent)]">
            {candidate.sourceName || "RBHQ"} · {candidate.targetLane || "Unassigned lane"}
          </p>
          <h3 className="mt-1 line-clamp-2 text-[16px] font-black leading-tight text-[var(--rb-text)]">{candidate.title}</h3>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--rb-text)] px-2.5 py-1 text-[11px] font-black text-white">
          {Math.round(candidate.score)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-black ${rankTone(candidate.rankLabel)}`}>
          {formatRankLabel(candidate.rankLabel)}
        </span>
        <span className="rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-2.5 py-1 text-[10.5px] font-bold text-[var(--rb-muted)]">
          {formatUrgencyLabel(candidate.urgency)}
        </span>
      </div>

      {candidate.whyNow ? (
        <p className="mt-3 text-[12px] font-semibold leading-5 text-[var(--rb-text)]">{candidate.whyNow}</p>
      ) : null}
      {candidate.operatorSummary ? (
        <p className="mt-2 text-[12px] leading-5 text-[var(--rb-muted)]">{candidate.operatorSummary}</p>
      ) : null}
      {candidate.hook ? (
        <p className="mt-3 rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] p-3 text-[12px] font-semibold leading-5 text-[var(--rb-text)]">
          {candidate.hook}
        </p>
      ) : null}
      {candidate.suggestedCaption ? (
        <p className="mt-3 text-[12px] leading-5 text-[var(--rb-muted)]">{candidate.suggestedCaption}</p>
      ) : null}
      {candidate.suggestedHashtags.length > 0 ? (
        <p className="mt-2 text-[11px] font-bold leading-5 text-[var(--rb-muted)]">{candidate.suggestedHashtags.join(" ")}</p>
      ) : null}
    </article>
  );
}

function DailyPlanCompactClip({ clip, index }: { clip: DailyPlanClip; index?: number }) {
  return (
    <div className="flex items-start gap-3 rounded-[16px] border border-[var(--rb-line)] bg-[var(--rb-surface)] p-3">
      <span className="grid h-8 min-w-8 place-items-center rounded-full bg-[var(--rb-text)] px-2 text-[11px] font-black text-white">
        {index ?? Math.round(clip.score)}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-[13px] font-black leading-snug text-[var(--rb-text)]">{clip.title}</h3>
        <p className="mt-1 truncate text-[11px] text-[var(--rb-muted)]">
          {clip.sourceName || "RBHQ"} · {clip.lane} · {formatRankLabel(clip.rankLabel)} · {formatUrgencyLabel(clip.urgency)}
        </p>
        {(clip.reasons ?? []).length > 0 ? (
          <p className="mt-1 line-clamp-1 text-[10.5px] font-semibold text-[var(--rb-faint)]">
            {(clip.reasons ?? [])[0]?.replace(/\.$/, "")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type ManagedSource = { id: string; url: string; platform: string; channel_name: string | null };

function normalizeSourceUrl(input: string): string {
  const trimmed = input.trim();
  if (/^UC[A-Za-z0-9_-]{22}$/.test(trimmed)) {
    return `https://www.youtube.com/channel/${trimmed}`;
  }
  return trimmed;
}

function SourcesScreen({
  sources,
  selectedSource,
  selectedChannelId,
  userChannelIds,
  onSelectSource,
}: {
  sources: SourceFilterOption[];
  selectedSource: string;
  selectedChannelId: string;
  userChannelIds: string[];
  onSelectSource: (value: string) => void;
}) {
  const total = sources.reduce((sum, item) => sum + item.pending_count, 0);
  const visibleRbhqSources = useMemo(
    () =>
      userChannelIds.length > 0
        ? RBHQ_SOURCES.filter((src) => userChannelIds.includes(src.channelDbId))
        : RBHQ_SOURCES,
    [userChannelIds],
  );
  const [newUrl, setNewUrl] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [addError, setAddError] = useState("");
  const [managedSources, setManagedSources] = useState<ManagedSource[]>([]);

  useEffect(() => {
    if (!selectedChannelId) return;
    fetch(`/api/sources/${selectedChannelId}`)
      .then((r) => r.json())
      .then((d: { sources?: ManagedSource[] }) => { setManagedSources(d.sources ?? []); })
      .catch(() => {});
  }, [selectedChannelId]);

  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault();
    const url = normalizeSourceUrl(newUrl);
    if (!url || !selectedChannelId) return;
    setAddingSource(true);
    setAddError("");
    try {
      const csrfHeaders = await getCsrfHeaders();
      const res = await fetch(`/api/sources/${selectedChannelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        body: JSON.stringify({ url, platform: "youtube" }),
      });
      const data = (await res.json()) as { source?: ManagedSource; error?: string };
      if (res.ok && data.source) {
        setManagedSources((prev) => [data.source as ManagedSource, ...prev]);
        setNewUrl("");
      } else {
        setAddError(data.error ?? "Failed to add source.");
      }
    } catch {
      setAddError("Network error.");
    } finally {
      setAddingSource(false);
    }
  }

  return (
    <PageShell eyebrow="Signals" title="Sources" trailing={<Radio className="h-5 w-5 text-[#ff4d00]" />}>
      <div className="flex items-center gap-5 rounded-[16px] border border-[var(--rb-line)] bg-[var(--rb-surface)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[22px] font-black leading-none tracking-tight text-[var(--rb-text)]">{sources.length}</p>
          <p className="mt-1 text-[11px] font-semibold text-[var(--rb-muted)]">live sources</p>
        </div>
        <span className="h-8 w-px shrink-0 bg-[var(--rb-line)]" />
        <div className="min-w-0">
          <p className="text-[22px] font-black leading-none tracking-tight text-[var(--rb-text)]">{total}</p>
          <p className="mt-1 text-[11px] font-semibold text-[var(--rb-muted)]">pending clips</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-surface)] px-3 py-2.5">
        <span className="shrink-0 rounded-md bg-[#0A0A0A] px-2 py-0.5 text-[10px] font-black text-white">1080×1920</span>
        <span className="shrink-0 rounded-md border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-2 py-0.5 text-[10px] font-bold text-[var(--rb-muted)]">9:16</span>
        <p className="min-w-0 truncate text-[11px] font-medium text-[var(--rb-muted)]">vertical required · TikTok only</p>
      </div>

      <div className="mt-6">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--rb-muted)]">Source Buckets</p>
          <span className="rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-2 py-0.5 text-[10px] font-black text-[var(--rb-muted)]">
            {visibleRbhqSources.length}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {visibleRbhqSources.map((src) => (
            <OperatorSourceCard key={src.id} source={src} />
          ))}
        </div>
      </div>

      <form onSubmit={(e) => void handleAddSource(e)} className="mt-5 flex flex-col gap-2">
        <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--rb-muted)]">Add source</label>
        <input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://youtube.com/channel/… or UC…"
          className="h-11 w-full rounded-[14px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-3 text-sm font-medium text-[var(--rb-text)] outline-none focus:border-[var(--rb-accent)]"
        />
        {addError && <p className="text-xs font-semibold text-red-600">{addError}</p>}
        <button
          type="submit"
          disabled={addingSource || !newUrl.trim()}
          className="h-10 rounded-[14px] bg-[var(--rb-accent)] text-xs font-black text-white active:scale-[0.99] disabled:opacity-45"
        >
          {addingSource ? "Adding…" : "Add source"}
        </button>
      </form>

      {managedSources.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--rb-muted)]">Configured</p>
          {managedSources.map((s) => (
            <div key={s.id} className="flex min-h-12 items-center gap-3 rounded-[18px] border border-[var(--rb-line)] bg-[var(--rb-surface)] px-4 shadow-sm">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] text-[10px] font-black text-[var(--rb-muted)]">
                {SOURCE_CODES[s.platform?.toLowerCase()] ?? "RB"}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--rb-text)]">{s.channel_name ?? s.url}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--rb-muted)]">Filter Queue</p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => onSelectSource("")}
            className={`flex min-h-16 items-center justify-between rounded-[24px] border px-4 text-left shadow-sm active:scale-[0.99] ${
              selectedSource === "" ? "border-[var(--rb-accent)]/40 bg-[var(--rb-accent)]/8" : "border-[var(--rb-line)] bg-[var(--rb-surface)]"
            }`}
          >
            <div>
              <p className="text-base font-black text-[var(--rb-text)]">All sources</p>
              <p className="mt-1 text-sm font-medium text-[var(--rb-muted)]">Unified operator queue</p>
            </div>
            <ChevronRight className="h-5 w-5 text-[var(--rb-muted)]" />
          </button>
          {sources.map((item) => (
            <button
              key={`${item.source_name}-${item.source_type}`}
              type="button"
              onClick={() => onSelectSource(item.source_name)}
              className={`flex min-h-[4.5rem] items-center gap-4 rounded-[24px] border p-4 text-left shadow-sm active:scale-[0.99] ${
                selectedSource === item.source_name ? "border-[var(--rb-accent)]/40 bg-[var(--rb-accent)]/8" : "border-[var(--rb-line)] bg-[var(--rb-surface)]"
              }`}
            >
              <span className="grid h-12 w-12 place-items-center rounded-[18px] border border-[var(--rb-line)] bg-[var(--rb-graphite)] text-xs font-black text-[var(--rb-muted)]">
                {SOURCE_CODES[item.source_type?.toLowerCase()] ?? "RB"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-black text-[var(--rb-text)]">{item.source_name}</p>
                <p className="mt-1 text-sm font-medium text-[var(--rb-muted)]">
                  {item.source_type} · {item.status} · {item.last_ingested_at ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.last_ingested_at)) : "never ingested"}
                </p>
              </div>
              <span className="rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-3 py-1 text-sm font-black text-[var(--rb-text)]">{item.pending_count}</span>
            </button>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

function sourceTypeLabel(type: RbhqSourceType): string {
  switch (type) {
    case "watchlist": return "Watchlist";
    case "upload_folder": return "Upload Folder";
    case "manual_upload": return "Manual Upload";
    case "trend_research": return "Trend Research";
    case "topic_monitor": return "Topic Monitor";
    case "clip_bucket": return "Clip Bucket";
  }
}

function channelColorForId(channelId: string): { bg: string; text: string } {
  if (channelId === "rb_sports") return { bg: "#E8EEFA", text: "#003087" };
  if (channelId === "rb_arena") return { bg: "#FFF1EC", text: "#CC3A00" };
  if (channelId === "rb_women") return { bg: "#F0F0F0", text: "#0A0A0A" };
  if (channelId === "rb_combat") return { bg: "#F5EAFF", text: "#6D28D9" };
  if (channelId === "rb_futbol") return { bg: "#FFF1EC", text: "#C0392B" };
  if (channelId === "rb_cfb") return { bg: "#FFF8E0", text: "#7B0000" };
  return { bg: "#F5F5F5", text: "#0A0A0A" };
}

function OperatorSourceCard({ source }: { source: RbhqSource }) {
  const statusColor = source.status === "ready"
    ? { label: "TikTok Ready", color: "#16A34A", bg: "#ECFDF5" }
    : source.status === "needs_review"
    ? { label: "Needs Review", color: "#D97706", bg: "#FFFBEB" }
    : { label: "Blocked", color: "#DC2626", bg: "#FFF1F2" };

  const channelColor = channelColorForId(source.channelId);
  const notesLc = source.notes?.toLowerCase() ?? "";

  const showWrongAspect =
    source.status === "blocked" &&
    (notesLc.includes("aspect") || notesLc.includes("16:9"));

  const showNeedsResize =
    notesLc.includes("resize") &&
    (source.status === "blocked" || source.status === "needs_review");

  return (
    <article className="min-w-0 overflow-hidden rounded-[16px] border border-[var(--rb-line)] bg-[var(--rb-surface)] shadow-sm">
      <div className="px-3.5 pb-3 pt-3">
        {/* Header: chips left, status badge right — no ml-auto in flex-wrap */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-black"
              style={{ background: channelColor.bg, color: channelColor.text }}
            >
              {source.channelLabel}
            </span>
            {source.handle && (
              <span className="max-w-[96px] truncate text-[9.5px] font-medium text-[var(--rb-faint)]">
                {source.handle}
              </span>
            )}
            <span className="shrink-0 rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-2 py-0.5 text-[9.5px] font-bold text-[var(--rb-muted)]">
              {source.platform}
            </span>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-black"
            style={{ background: statusColor.bg, color: statusColor.color }}
          >
            {statusColor.label}
          </span>
        </div>

        {/* Source name */}
        <p className="mt-2 min-w-0 text-[13px] font-black leading-snug text-[var(--rb-text)]">
          {source.name}
        </p>

        {/* Type + last checked */}
        <p className="mt-0.5 text-[10.5px] font-medium text-[var(--rb-muted)]">
          {sourceTypeLabel(source.sourceType)} · checked {source.lastCheckedLabel}
        </p>

        {/* Requirements — one quiet line per card, no repeated badges */}
        <p className="mt-1 text-[10px] font-medium text-[var(--rb-faint)]">
          Required: 1080×1920 · 9:16 vertical
        </p>

        {/* Warning — only when relevant, and visually distinct */}
        {(showWrongAspect || showNeedsResize) && (
          <div className="mt-2">
            {showWrongAspect ? (
              <span className="inline-block rounded-md border border-[#DC2626]/30 bg-[#FFF1F2] px-2 py-0.5 text-[9.5px] font-bold text-[#DC2626]">
                wrong aspect ratio
              </span>
            ) : (
              <span className="inline-block rounded-md border border-[#D97706]/30 bg-[#FFFBEB] px-2 py-0.5 text-[9.5px] font-bold text-[#D97706]">
                needs resize
              </span>
            )}
          </div>
        )}

        {/* Notes */}
        {source.notes && (
          <p className="mt-1.5 text-[10.5px] font-medium leading-relaxed text-[var(--rb-muted)]">
            {source.notes}
          </p>
        )}
      </div>
    </article>
  );
}

function PageShell({
  eyebrow,
  title,
  trailing,
  children,
}: {
  eyebrow: string;
  title: string;
  trailing: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="hide-scrollbar min-h-dvh w-full overflow-y-auto overflow-x-hidden bg-[var(--rb-bg)] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+104px)] pt-[calc(env(safe-area-inset-top,0px)+18px)]"
    >
      <header className="sticky top-0 z-20 -mx-4 mb-5 border-b border-[var(--rb-line)] bg-[var(--rb-bg)]/95 px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+6px)] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--rb-accent)]">{eyebrow}</p>
            <h1 className="mt-1 text-4xl font-black leading-none tracking-tight text-[var(--rb-text)]">{title}</h1>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-full border border-[var(--rb-line)] bg-[var(--rb-surface)]">
            {trailing}
          </div>
        </div>
      </header>
      {children}
    </motion.section>
  );
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[26px] border border-[var(--rb-line)] bg-[var(--rb-surface)] p-4 shadow-sm">
      <p className="text-3xl font-black leading-none tracking-tight text-[var(--rb-text)]">{value}</p>
      <p className="mt-2 text-sm font-semibold text-[var(--rb-muted)]">{label}</p>
    </div>
  );
}

function SmallButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-12 min-w-12 place-items-center rounded-[18px] border border-[var(--rb-line)] bg-[var(--rb-surface)] text-[var(--rb-text)] shadow-sm active:scale-95"
    >
      {children}
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative grid min-h-[380px] place-items-center overflow-hidden rounded-[28px] border border-[var(--rb-line)] bg-[var(--rb-surface)] px-8 text-center shadow-sm">
      <div className="absolute inset-x-10 top-12 h-24 rounded-full bg-[var(--rb-accent)]/8 blur-3xl" />
      <div className="relative">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] border border-[var(--rb-line)] bg-[var(--rb-graphite)]">
          <Check className="h-7 w-7 text-[var(--rb-accent)]" />
        </div>
        <p className="mt-5 text-3xl font-black leading-none tracking-tight text-[var(--rb-text)]">{title}</p>
        <p className="mx-auto mt-3 max-w-[260px] text-sm font-medium leading-6 text-[var(--rb-muted)]">{body}</p>
      </div>
    </div>
  );
}

function QueueEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-[18px] font-semibold lowercase text-[var(--rb-text)]">{title}</p>
      <span className="mx-auto mt-3 block h-px w-8 bg-[var(--rb-accent)]" />
      <p className="mx-auto mt-4 max-w-[200px] text-[13px] lowercase leading-5 text-[var(--rb-muted)]">{body}</p>
      <div className="mt-5 flex items-center gap-1.5 text-[11px] lowercase text-[var(--rb-faint)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--rb-accent)] motion-safe:animate-[rbhq-live-breathe_1.8s_ease-in-out_infinite]" />
        live sources armed
      </div>
    </div>
  );
}

function BottomNav({ active, onChange }: { active: AppTab; onChange: (tab: AppTab) => void }) {
  const items: Array<{ id: AppTab; label: string; emoji: string }> = [
    { id: "dashboard", label: "Dashboard", emoji: "🏠" },
    { id: "queue", label: "Queue", emoji: "📥" },
    { id: "plan", label: "Plan", emoji: "📋" },
    { id: "sources", label: "Sources", emoji: "🔗" },
    { id: "publish", label: "Publish", emoji: "📤" },
    { id: "profile", label: "Profile", emoji: "👤" },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[520px] border-t border-[#E7E5E1] bg-white"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
    >
      <div className="grid grid-cols-6 px-1 pt-2">
        {items.map((item) => {
          const selected = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition active:scale-95"
              style={{ opacity: selected ? 1 : 0.45, color: "#0A0A0A" }}
              aria-label={item.label}
              aria-current={selected ? "page" : undefined}
            >
              <span className="text-[20px] leading-tight">{item.emoji}</span>
              <span className="text-[9px] font-bold tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function laneMetaForChannel(label: string | null | undefined) {
  const v = (label ?? "").toLowerCase();
  if (v.includes("arena") || v.includes("gaming") || v.includes("esports")) return { emoji: "🎮", color: "#F97316", bg: "#FFF1E8" };
  if (v.includes("women")) return { emoji: "🏐", color: "#0A0A0A", bg: "#F0F0F0" };
  if (v.includes("combat")) return { emoji: "🥊", color: "#6D28D9", bg: "#F5EAFF" };
  if (v.includes("futbol") || v.includes("soccer")) return { emoji: "⚽", color: "#E2162B", bg: "#FFF1EC" };
  if (v.includes("cfb")) return { emoji: "🏈", color: "#7B0000", bg: "#FFF8E0" };
  return { emoji: "🔥", color: "#003087", bg: "#E8EEFA" };
}

function QueueListCard({ clip, onReview }: { clip: Clip; onReview: (id: string) => void }) {
  const score = clip.intelligence?.score ?? clip.analysis?.priorityScore ?? clip.score;
  const rankLabel = clip.intelligence?.rankLabel ?? clip.analysis?.rankLabel;
  const urgency = clip.intelligence?.urgency;
  const captionDraft = clip.intelligence?.suggestedCaption ?? clip.analysis?.captionDraft ?? "";
  const hashtags = clip.intelligence?.suggestedHashtags ?? clip.analysis?.hashtagPack ?? [];
  const signals = clip.intelligence?.reasons ?? [];

  return (
    <div className="flex items-start gap-3 rounded-[16px] border border-[var(--rb-line)] bg-white p-3">
      <div
        className="relative shrink-0 overflow-hidden rounded-[12px] bg-[#111]"
        style={{ width: 64, height: 88 }}
      >
        {clip.thumbnailUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${clip.thumbnailUrl})` }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] font-bold text-white/40">
            {sourceAvatar(clip.sourceName)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11.5px] text-[var(--rb-muted)]">
          {clip.sourceName} · {clip.sourceType}{clip.originalPlatform ? ` · ${clip.originalPlatform}` : ""}
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-[14px] font-black leading-snug text-[var(--rb-text)]">{clip.title}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-[var(--rb-text)] px-2 py-0.5 text-[10.5px] font-black text-white">{Math.round(score)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${rankTone(rankLabel)}`}>
            {formatRankLabel(rankLabel)}
          </span>
          <span className="rounded-full border border-[var(--rb-line)] bg-[var(--rb-graphite)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--rb-muted)]">
            {formatUrgencyLabel(urgency)}
          </span>
          <ClipStatusBadge status={clip.status} />
          {clip.durationSeconds ? (
            <span className="text-[11px] text-[var(--rb-faint)]">{formatDuration(clip.durationSeconds)}</span>
          ) : null}
        </div>
        <div className="mt-2">
          <QueueReadinessStrip readiness={clip.packageReadiness} />
        </div>
        {signals.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {signals.slice(0, 3).map((signal) => (
              <span key={signal} className="rounded-full bg-[var(--rb-graphite)] px-2 py-0.5 text-[9.5px] font-bold text-[var(--rb-muted)]">
                {signal.replace(/\.$/, "")}
              </span>
            ))}
          </div>
        ) : null}
        {(clip.intelligence?.whyNow || clip.analysis?.whyNow) ? (
          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-4 text-[var(--rb-muted)]">{clip.intelligence?.whyNow ?? clip.analysis?.whyNow}</p>
        ) : null}
        {(clip.intelligence?.operatorSummary || clip.analysis?.operatorSummary) ? (
          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-4 text-[var(--rb-muted)]">{clip.intelligence?.operatorSummary ?? clip.analysis?.operatorSummary}</p>
        ) : null}
        <p className="mt-1.5 line-clamp-2 text-[11.5px] font-semibold leading-4 text-[var(--rb-text)]">
          {clip.intelligence?.hook ?? clip.analysis?.hookLine ?? clip.recommendedHook ?? clip.hook}
        </p>
        {captionDraft ? (
          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-4 text-[var(--rb-muted)]">{captionDraft}</p>
        ) : null}
        {hashtags.length > 0 ? (
          <p className="mt-1 truncate text-[10.5px] font-bold text-[var(--rb-faint)]">{hashtags.join(" ")}</p>
        ) : null}
        <button
          type="button"
          onClick={() => onReview(clip.id)}
          className="mt-2 h-8 rounded-full bg-[var(--rb-text)] px-4 text-[12px] font-bold text-white active:scale-[0.97]"
        >
          Review
        </button>
      </div>
    </div>
  );
}

function ClipStatusBadge({ status }: { status: ClipStatus }) {
  if (status === "pending") {
    return <span className="rounded-full bg-[#FFF1EC] px-2 py-0.5 text-[10.5px] font-bold text-[#FF5C1A]">Needs Review</span>;
  }
  if (status === "held") {
    return <span className="rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[10.5px] font-bold text-[#8B877D]">Held</span>;
  }
  if (status === "approved" || status === "approving") {
    return <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10.5px] font-bold text-[#16A34A]">Approved</span>;
  }
  if (status === "rejected" || status === "rejecting") {
    return <span className="rounded-full bg-[#FFF1F2] px-2 py-0.5 text-[10.5px] font-bold text-[#DC2626]">Rejected</span>;
  }
  return null;
}

function DashboardScreen({
  user,
  clips,
  publishItems,
  sources,
  channels,
  selectedChannelId,
  onSelectChannel,
  onNavigate,
}: {
  user: User;
  clips: Clip[];
  publishItems: PublishQueueItem[];
  sources: SourceFilterOption[];
  channels: UserChannel[];
  selectedChannelId: string;
  onSelectChannel: (id: string) => void;
  onNavigate: (tab: AppTab) => void;
}) {
  const pendingCount = clips.filter((c) => c.status === "pending").length;
  const issueCount = sources.filter((s) => s.status !== "active").length;

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="hide-scrollbar w-full overflow-y-auto overflow-x-hidden bg-[var(--rb-bg)]"
      style={{ minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)" }}
    >
      <div className="px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+58px)]">
        <h1 className="text-[24px] font-black text-[var(--rb-text)]">RBHQ 🔥</h1>
        <p className="mt-1 text-[13px] text-[var(--rb-muted)]">Admin Command Center</p>
      </div>

      <div className="mx-5 mb-4 rounded-[20px] bg-[#0A0A0A] p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#666]">Needs Action Now</p>
          <button
            type="button"
            onClick={() => onNavigate("queue")}
            className="text-[12px] font-bold text-[#FF5C1A]"
          >
            Review All →
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[26px] font-black leading-none text-[#FF5C1A]">{pendingCount}</p>
            <p className="mt-1 text-[11px] text-[#8B877D]">Needs Review</p>
          </div>
          <div>
            <p className="text-[26px] font-black leading-none text-[#6FE0A5]">{publishItems.length}</p>
            <p className="mt-1 text-[11px] text-[#8B877D]">Ready to Publish</p>
          </div>
          <div>
            <p className="text-[26px] font-black leading-none text-[#FF7A7A]">{issueCount}</p>
            <p className="mt-1 text-[11px] text-[#8B877D]">Source Issues</p>
          </div>
        </div>
      </div>

      <div className="px-5">
        <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--rb-muted)]">Lanes Overview</p>
        <div className="flex flex-col gap-3">
          {channels.map((ch) => {
            const meta = laneMetaForChannel(ch.label);
            const laneCount = sources
              .filter((s) => s.channel_id === ch.id)
              .reduce((sum, s) => sum + s.pending_count, 0);
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => { onSelectChannel(ch.id); onNavigate("queue"); }}
                className={`flex items-center gap-4 rounded-[18px] border p-4 text-left shadow-sm active:scale-[0.99] ${
                  selectedChannelId === ch.id
                    ? "border-[var(--rb-accent)]/40 bg-[var(--rb-accent)]/8"
                    : "border-[var(--rb-line)] bg-white"
                }`}
              >
                <span
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] text-[24px]"
                  style={{ background: meta.bg, color: meta.color }}
                >
                  {meta.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-black text-[var(--rb-text)]">{displayChannelLabel(ch.label)}</p>
                  <p className="text-[12px] text-[var(--rb-muted)]">{laneCount} pending</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--rb-faint)]" />
              </button>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}

function ProfileScreen({ user, onLogout }: { user: User; onLogout: () => void }) {
  const channels = user.channels ?? [];
  return (
    <motion.section
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="hide-scrollbar w-full overflow-y-auto overflow-x-hidden bg-[var(--rb-bg)]"
      style={{ minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)", paddingTop: "calc(env(safe-area-inset-top, 0px) + 58px)" }}
    >
      <div className="px-5 pb-5">
        <h1 className="text-[24px] font-black text-[var(--rb-text)]">Profile</h1>
        <p className="mt-1 text-[13px] text-[var(--rb-muted)]">Operator account</p>
      </div>

      <div className="mx-5 overflow-hidden rounded-[18px] border border-[var(--rb-line)] bg-white shadow-sm">
        <div className="flex items-center gap-4 border-b border-[var(--rb-line)] px-4 py-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--rb-text)] text-[16px] font-black text-white">
            {(user.name?.[0] ?? "R").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-black text-[var(--rb-text)]">{user.name}</p>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--rb-accent)]">
              {user.role ?? "operator"}
            </p>
          </div>
        </div>

        {channels.length > 0 && (
          <div className="border-b border-[var(--rb-line)] px-4 py-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--rb-muted)]">
              Assigned Lanes
            </p>
            <div className="flex flex-col gap-2">
              {channels.map((ch) => (
                <div key={ch.id} className="flex items-center gap-3">
                  <span className="text-[16px] leading-none">{laneMetaForChannel(ch.label).emoji}</span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-[var(--rb-text)]">
                      {displayChannelLabel(ch.label)}
                    </p>
                    {ch.handle && (
                      <p className="text-[11px] text-[var(--rb-muted)]">{ch.handle}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition active:bg-[#FFF1F2]"
        >
          <LogOut className="h-5 w-5 text-[#DC2626]" strokeWidth={1.5} />
          <span className="text-[14px] font-semibold text-[#DC2626]">Sign out</span>
        </button>
      </div>
    </motion.section>
  );
}
