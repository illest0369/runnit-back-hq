"use client";

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  CalendarClock,
  Check,
  ChevronRight,
  Copy,
  Download,
  Flame,
  Hash,
  ListVideo,
  LogOut,
  Radio,
  Share,
  Sparkles,
  Pause,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getCsrfHeaders } from "@/lib/client-csrf";
import type { PublishExportPackage } from "@/lib/export/types";

type AppTab = "queue" | "publish" | "sources";
type ClipStatus = "pending" | "held" | "approving" | "approved" | "rejecting" | "rejected";
type PublishStatus =
  | "not_ready"
  | "metricool_ready_manual_export"
  | "ready_for_manual_publish"
  | "metricool_scheduled"
  | "metricool_published"
  | "metricool_failed"
  | "manually_published";
type QueueAction = "approve" | "reject" | "hold";

type User = {
  id: string;
  name: string;
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
  source_name?: string | null;
  source_type?: string | null;
  sport?: string | null;
  league?: string | null;
  duration_seconds?: number | string | null;
  aspect_ratio?: string | null;
  recommended_hook?: string | null;
  moderation_notes?: string[] | null;
  risk_flags?: string[] | null;
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
  sport: string | null;
  league: string | null;
  durationSeconds: number | null;
  aspectRatio: string | null;
  recommendedHook: string | null;
  moderationNotes: string[];
  riskFlags: string[];
  approvedAt: string | null;
};

type PublishQueueItem = Clip & {
  exportPackage: PublishExportPackage;
};

type QueueMode = "pending" | "held";
type DecisionAction = QueueAction;

const READY_PUBLISH_STATUSES = new Set<PublishStatus>(["metricool_ready_manual_export", "ready_for_manual_publish"]);

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
  if (value.includes("arena")) return "arena";
  if (value.includes("women")) return "women";
  if (value.includes("combat")) return "combat";
  if (value.includes("cfb")) return "runnitbackcfb";
  return "sports";
}

function displayChannelLabel(label: string | null | undefined) {
  const value = label?.trim().toLowerCase() || "rbhq";
  if (value === "sports") return "rb sports";
  if (value === "arena") return "rb arena";
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

async function readApiJson(response: Response, fallbackMessage: string) {
  try {
    return await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }
}

function mapApiClip(item: ReviewClipApi): Clip | null {
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const title = typeof item.title === "string" ? item.title : "";
  const hook = typeof item.hook === "string" ? item.hook : "";
  const videoUrl = item.cdn_url ?? item.video_url ?? item.local_url ?? item.tiktok_url ?? item.source_video_url ?? null;
  const thumbnailUrl = item.thumbnail_url ?? null;
  const moderationNotes = Array.isArray(item.moderation_notes) ? item.moderation_notes : [];
  const publishStatus = readMetricoolStatus(moderationNotes, item.publish_status);

  if (!id || !videoUrl) return null;

  return {
    id,
    title: shortText(hook || title || "Untitled clip"),
    hook: hook || title || "Untitled clip",
    score: parseNumber(item.performance_score ?? item.score) ?? 0,
    performanceLabel: item.performance_label ?? "decent",
    status: item.review_status === "skipped" ? "held" : READY_PUBLISH_STATUSES.has(publishStatus) ? "approved" : "pending",
    publishStatus,
    thumbnailUrl,
    videoUrl,
    sourceName: item.source_name ?? "RBHQ",
    sourceType: item.source_type ?? "unknown",
    sport: item.sport ?? null,
    league: item.league ?? null,
    durationSeconds: parseNumber(item.duration_seconds),
    aspectRatio: item.aspect_ratio ?? "9:16",
    recommendedHook: item.recommended_hook ?? null,
    moderationNotes,
    riskFlags: Array.isArray(item.risk_flags) ? item.risk_flags : [],
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
      sport: item.sport ?? null,
      league: item.league ?? null,
      durationSeconds: parseNumber(item.duration_seconds),
      aspectRatio: item.aspect_ratio ?? "9:16",
      recommendedHook: item.recommended_hook ?? null,
      moderationNotes: Array.isArray(item.moderation_notes) ? item.moderation_notes : [],
      riskFlags: Array.isArray(item.risk_flags) ? item.risk_flags : [],
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
  const [source, setSource] = useState("");
  const [queueMode, setQueueMode] = useState<QueueMode>("pending");
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

  const fetchQueue = useCallback(async (channelId: string, selectedSource = source, mode = queueMode) => {
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
        await fetchQueue(initialChannelId, "", "pending");
        await Promise.allSettled([fetchPublishQueue(), fetchSources()]);
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
  }, [fetchQueue, fetchPublishQueue, fetchSources]);

  useEffect(() => {
    if (!user || !selectedChannelId) return;
    const currentChannelId = selectedChannelId;
    let alive = true;

    async function refresh() {
      try {
        await fetchQueue(currentChannelId, source, queueMode);
        await Promise.allSettled([fetchPublishQueue(), fetchSources()]);
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
  }, [fetchQueue, fetchPublishQueue, fetchSources, queueMode, selectedChannelId, source, user]);

  function handleChannelChange(channelId: string) {
    if (channelId === selectedChannelId) return;
    optimisticIdsRef.current.clear();
    setSelectedChannelId(channelId);
    setSource("");
    setActiveId(null);
    setClips([]);
  }

  async function moderateClip(id: string, action: DecisionAction) {
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

  async function publishNow(id: string) {
    try {
      const csrfHeaders = await getCsrfHeaders();
      const response = await fetch(`/api/metricool-export/${id}/publish-now`, {
        method: "POST",
        headers: csrfHeaders,
      });
      if (!response.ok) throw new Error("publish failed");
      await fetchPublishQueue();
      setToast(user?.metricoolTestMode ? "test handoff sent" : "sent to metricool");
    } catch {
      setToast("publish failed");
    }
  }

  async function schedulePost(id: string, scheduledAt: string) {
    try {
      const csrfHeaders = await getCsrfHeaders();
      const response = await fetch(`/api/metricool-export/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        body: JSON.stringify({ scheduledAt }),
      });
      if (!response.ok) throw new Error("schedule failed");
      await fetchPublishQueue();
      setToast(user?.metricoolTestMode ? "test schedule saved" : "scheduled");
    } catch {
      setToast("schedule failed");
    }
  }

  if (loading || !user) {
    return (
      <main className="rbhq-system min-h-dvh bg-black text-white">
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
    <main className={`rbhq-system rbhq-theme-${channelTheme} min-h-dvh overflow-hidden bg-black text-[var(--rb-text)]`}>
      <div className="operator-phone-shell relative mx-auto min-h-dvh w-full max-w-[520px] bg-black">
        <button
          type="button"
          aria-label="Log out"
          title="Log out"
          onClick={handleLogout}
          className="absolute right-4 top-[calc(env(safe-area-inset-top,0px)+18px)] z-[60] grid h-9 w-9 place-items-center rounded-full text-[var(--rb-faint)] transition active:scale-90 active:text-[var(--rb-text)]"
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </button>
        <AnimatePresence mode="wait">
          {tab === "queue" && (
            <QueueScreen
              key="queue"
              clips={clips}
              sources={visibleSources}
              channelLabel={selectedChannel?.label ?? user.channelLabel}
              channels={user.channels ?? []}
              selectedChannelId={selectedChannelId}
              selectedSource={source}
              activeId={activeId}
              error={error}
              onSelectChannel={handleChannelChange}
              onSelectSource={setSource}
              queueMode={queueMode}
              onQueueMode={setQueueMode}
              onActive={setActiveId}
              onModerate={moderateClip}
              exitDirections={exitDirections}
            />
          )}
          {tab === "publish" && (
            <PublishScreen
              key="publish"
              items={publishItems}
              metricoolTestMode={Boolean(user.metricoolTestMode)}
              onCopy={(message) => setToast(message)}
              onPublishNow={publishNow}
              onSchedule={schedulePost}
            />
          )}
          {tab === "sources" && (
            <SourcesScreen
              key="sources"
              sources={sources}
              selectedSource={source}
              onSelectSource={(value) => {
                setSource(value);
                setTab("queue");
              }}
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
              className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+104px)] z-[70] -translate-x-1/2 rounded-full border border-white/[0.08] bg-black/72 px-4 py-2 text-[var(--rb-text)] shadow-[0_18px_54px_rgba(0,0,0,0.36)] backdrop-blur-xl"
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
  sources,
  channelLabel,
  channels,
  selectedChannelId,
  selectedSource,
  activeId,
  error,
  queueMode,
  onSelectChannel,
  onSelectSource,
  onQueueMode,
  onActive,
  onModerate,
  exitDirections,
}: {
  clips: Clip[];
  sources: SourceFilterOption[];
  channelLabel: string;
  channels: UserChannel[];
  selectedChannelId: string;
  selectedSource: string;
  activeId: string | null;
  error: string;
  queueMode: QueueMode;
  onSelectChannel: (channelId: string) => void;
  onSelectSource: (value: string) => void;
  onQueueMode: (value: QueueMode) => void;
  onActive: (id: string) => void;
  onModerate: (id: string, action: DecisionAction) => void;
  exitDirections: Record<string, DecisionAction>;
}) {
  const activeIndex = Math.max(0, clips.findIndex((clip) => clip.id === activeId));
  const activeClip = clips[activeIndex] ?? clips[0] ?? null;
  const nextClip = clips[activeIndex + 1] ?? clips[activeIndex === 0 ? 1 : 0] ?? null;
  const preloadClips = useMemo(() => clips.slice(Math.max(0, activeIndex), activeIndex + 4), [activeIndex, clips]);
  const label = displayChannelLabel(channelLabel);

  useEffect(() => {
    preloadClips.forEach(preloadClipMedia);
  }, [preloadClips]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!activeClip) return;

      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        onModerate(activeClip.id, "approve");
      } else if (key === "r") {
        event.preventDefault();
        onModerate(activeClip.id, "reject");
      } else if (key === "h" || key === "s") {
        event.preventDefault();
        onModerate(activeClip.id, "hold");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeClip, onModerate]);

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="relative h-dvh overflow-hidden bg-black"
    >
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-5 pt-[calc(env(safe-area-inset-top,0px)+22px)]">
        <div>
          <p className="text-[13px] font-medium lowercase leading-none tracking-[-0.01em] text-[var(--rb-text)]">{label}</p>
          <p className="mt-2 text-[10px] font-medium uppercase leading-none text-[var(--rb-accent)]">live</p>
          {channels.length > 1 && (
            <ChannelSelect
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelectChannel={onSelectChannel}
            />
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-normal text-[var(--rb-text)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--rb-accent)] motion-safe:animate-[rbhq-live-breathe_1.8s_ease-in-out_infinite]" />
          <motion.span key={clips.length} initial={{ opacity: 0.45 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}>
            {formatCompactCount(clips.length)}
          </motion.span>
        </div>
      </header>

      <SourceRail
        sources={sources}
        selectedSource={selectedSource}
        queueMode={queueMode}
        hasChannelSwitcher={channels.length > 1}
        onSelectSource={onSelectSource}
        onQueueMode={onQueueMode}
      />

      {error && clips.length > 0 && (
        <div className="absolute left-1/2 top-[calc(env(safe-area-inset-top,0px)+126px)] z-40 -translate-x-1/2 text-[11px] lowercase text-[var(--rb-muted)]">
          reconnecting
        </div>
      )}

      <div className="relative z-10 h-dvh">
        {error && clips.length === 0 ? (
          <LiveEmptyState title="syncing clips" body="reconnecting live sources" />
        ) : clips.length === 0 ? (
          <LiveEmptyState
            title="queue empty"
            body={queueMode === "held" ? "held clips stay here until you approve or reject them" : selectedSource ? "no clips in this source right now" : "new clips will appear here as sources sync"}
          />
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {activeClip && (
              <QueueClipCard
                key={activeClip.id}
                clip={activeClip}
                active
                exitDirection={exitDirections[activeClip.id]}
                nextVideoUrl={nextClip?.videoUrl ?? null}
                remainingCount={clips.length}
                onActive={onActive}
                onModerate={onModerate}
              />
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.section>
  );
}

function ChannelSelect({
  channels,
  selectedChannelId,
  onSelectChannel,
}: {
  channels: UserChannel[];
  selectedChannelId: string;
  onSelectChannel: (channelId: string) => void;
}) {
  return (
    <label className="pointer-events-auto mt-3 block">
      <span className="sr-only">Channel</span>
      <select
        value={selectedChannelId}
        onChange={(event) => onSelectChannel(event.target.value)}
        className="h-8 max-w-[168px] rounded-full border border-white/[0.14] bg-black/58 px-3 pr-8 text-[11px] font-medium lowercase text-[var(--rb-text)] outline-none backdrop-blur-xl transition focus:border-[var(--rb-accent)]"
        aria-label="Channel"
      >
        {channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {displayChannelLabel(channel.label)}
          </option>
        ))}
      </select>
    </label>
  );
}

function SourceRail({
  sources,
  selectedSource,
  queueMode,
  hasChannelSwitcher,
  onSelectSource,
  onQueueMode,
}: {
  sources: SourceFilterOption[];
  selectedSource: string;
  queueMode: QueueMode;
  hasChannelSwitcher: boolean;
  onSelectSource: (value: string) => void;
  onQueueMode: (value: QueueMode) => void;
}) {
  const sourceItems = sources.slice(0, 18);

  return (
    <div className={`absolute inset-x-0 z-30 ${hasChannelSwitcher ? "top-[calc(env(safe-area-inset-top,0px)+102px)]" : "top-[calc(env(safe-area-inset-top,0px)+62px)]"}`}>
      <div className="hide-scrollbar flex gap-3 overflow-x-auto px-5 pb-2">
        <button
          type="button"
          onClick={() => {
            onQueueMode("pending");
            onSelectSource("");
          }}
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border text-[10px] font-medium uppercase tracking-[-0.01em] backdrop-blur-xl transition active:scale-95 ${
            selectedSource === "" && queueMode === "pending"
              ? "border-[var(--rb-accent)] bg-[var(--rb-accent)] text-black"
              : "border-white/[0.12] bg-black/42 text-[var(--rb-text)]"
          }`}
          aria-label="All sources"
          title="All sources"
        >
          all
        </button>
        <button
          type="button"
          onClick={() => {
            onQueueMode("held");
            onSelectSource("");
          }}
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border text-[10px] font-medium uppercase tracking-[-0.01em] backdrop-blur-xl transition active:scale-95 ${
            queueMode === "held"
              ? "border-[var(--rb-accent)] bg-[var(--rb-accent)] text-black"
              : "border-white/[0.12] bg-black/42 text-[var(--rb-text)]"
          }`}
          aria-label="Held clips"
          title="Held clips"
        >
          held
        </button>
        {sourceItems.map((item) => {
          const selected = selectedSource === item.source_name && queueMode === "pending";
          return (
            <button
              key={`${item.channel_id ?? "channel"}-${item.source_name}-${item.source_type}`}
              type="button"
              onClick={() => {
                onQueueMode("pending");
                onSelectSource(item.source_name);
              }}
              className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full border text-[11px] font-medium uppercase backdrop-blur-xl transition active:scale-95 ${
                selected
                  ? "border-[var(--rb-accent)] bg-[var(--rb-accent)] text-black"
                  : "border-white/[0.12] bg-black/42 text-[var(--rb-text)]"
              }`}
              aria-label={item.source_name}
              title={item.source_name}
            >
              {sourceAvatar(item.source_name)}
              {item.pending_count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-black px-1 text-[9px] leading-none text-[var(--rb-text)] ring-1 ring-white/[0.12]">
                  {Math.min(99, item.pending_count)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QueueClipCard({
  clip,
  active,
  onActive,
  onModerate,
  exitDirection,
  nextVideoUrl,
  remainingCount,
}: {
  clip: Clip;
  active: boolean;
  onActive: (id: string) => void;
  onModerate: (id: string, action: DecisionAction) => void;
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

  return (
    <motion.div
      ref={ref}
      style={{ x, rotate, scale }}
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
      className="relative h-full min-h-dvh"
      onClick={() => setPaused((value) => !value)}
    >
      <article className="relative h-full overflow-hidden bg-black">
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
            className="absolute inset-0 h-full w-full bg-[#111111] object-cover"
          />
        )}
      </motion.div>
      {nextVideoUrl && <video src={nextVideoUrl} muted playsInline preload="auto" aria-hidden className="sr-only" />}
      <div className="absolute inset-0 bg-black/10" />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/64 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black via-black/62 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+116px)] text-[var(--rb-text)]">
        <p className="text-[11px] font-normal lowercase leading-none text-[var(--rb-accent)]">
          {formatDuration(clip.durationSeconds)}
        </p>
        <h2 className="mt-2 max-w-[82%] text-[clamp(22px,6.8vw,30px)] font-normal lowercase leading-[1.06] tracking-[-0.02em] [text-shadow:0_2px_18px_rgba(0,0,0,0.72)]">
          {clip.title}
        </h2>
        <p className="mt-3 max-w-[78%] truncate text-[13px] font-normal lowercase leading-5 text-[var(--rb-muted)] [text-shadow:0_2px_14px_rgba(0,0,0,0.74)]">
          {clip.sourceName}
          {clip.league ? ` · ${clip.league}` : clip.sport ? ` · ${clip.sport}` : ""}
          {remainingCount > 1 ? ` · ${remainingCount - 1} next` : ""}
          {Math.round(clip.score) > 0 ? ` · ${Math.round(clip.score)}` : ""}
        </p>
        <div className="mt-5 h-px w-full bg-white/[0.08]" />
      </div>

      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+104px)] right-5 z-30 flex flex-col items-center gap-4">
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={(event) => {
            event.stopPropagation();
            onModerate(clip.id, "approve");
          }}
          disabled={!canModerate}
          aria-label="Approve clip for publishing"
          title="Approve for publishing"
          className="grid h-14 w-14 place-items-center rounded-full bg-black/34 text-[var(--rb-accent)] shadow-[0_12px_34px_rgba(0,0,0,0.32)] ring-1 ring-white/[0.10] backdrop-blur-xl transition-opacity active:opacity-70 disabled:opacity-35"
        >
          <Flame className="h-7 w-7" strokeWidth={1.7} />
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={(event) => {
            event.stopPropagation();
            onModerate(clip.id, "hold");
          }}
          disabled={!canModerate || clip.status === "held"}
          aria-label="Hold clip for later review"
          title="Hold for later review"
          className="grid h-12 w-12 place-items-center rounded-full bg-black/30 text-[var(--rb-text)] shadow-[0_12px_34px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.10] backdrop-blur-xl transition-opacity active:opacity-70 disabled:opacity-35"
        >
          <Pause className="h-5 w-5" strokeWidth={1.8} />
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={(event) => {
            event.stopPropagation();
            onModerate(clip.id, "reject");
          }}
          disabled={!canModerate}
          aria-label="Reject clip"
          title="Reject clip"
          className="grid h-14 w-14 place-items-center rounded-full bg-black/34 text-[#ff2a3f] shadow-[0_12px_34px_rgba(0,0,0,0.32)] ring-1 ring-white/[0.10] backdrop-blur-xl transition-opacity active:opacity-70 disabled:opacity-35"
        >
          <X className="h-7 w-7" strokeWidth={1.8} />
        </motion.button>
      </div>
      </article>
    </motion.div>
  );
}

function PublishScreen({
  items,
  metricoolTestMode,
  onCopy,
  onPublishNow,
  onSchedule,
}: {
  items: PublishQueueItem[];
  metricoolTestMode: boolean;
  onCopy: (message: string) => void;
  onPublishNow: (id: string) => void;
  onSchedule: (id: string, scheduledAt: string) => void;
}) {
  return (
    <PageShell eyebrow="Handoff" title="Publish" trailing={<Sparkles className="h-5 w-5 text-[#ff4d00]" />}>
      <div className="grid grid-cols-2 gap-3">
        <MetricCard value={String(items.length)} label="Ready clips" />
        <MetricCard value={metricoolTestMode ? "Test" : "Live"} label="Metricool mode" />
      </div>

      <div className={`mt-3 rounded-[18px] border px-4 py-3 text-sm font-bold leading-5 ${
        metricoolTestMode
          ? "border-[#ff4d00]/28 bg-[#ff4d00]/10 text-white/72"
          : "border-white/[0.08] bg-white/[0.06] text-white/58"
      }`}>
        {metricoolTestMode
          ? "Metricool test mode is on. Now and Schedule create smoke-test handoffs only."
          : "Metricool live mode is on. Now and Schedule can create live Metricool handoffs."}
      </div>

      <a
        href="/metricool"
        className="mt-3 flex h-12 items-center justify-between rounded-[18px] border border-white/[0.08] bg-white/[0.06] px-4 text-sm font-black text-white active:scale-[0.99]"
      >
        Metricool export
        <ChevronRight className="h-5 w-5 text-[#ff4d00]" />
      </a>

      <div className="mt-5 flex flex-col gap-4">
        {items.length === 0 ? (
          <EmptyState title="No ready clips" body="Approved clips with export-ready video will appear here." />
        ) : items.map((item) => (
          <PublishCard
            key={item.id}
            item={item}
            onCopy={onCopy}
            onPublishNow={onPublishNow}
            onSchedule={onSchedule}
          />
        ))}
      </div>
    </PageShell>
  );
}

function PublishCard({
  item,
  onCopy,
  onPublishNow,
  onSchedule,
}: {
  item: PublishQueueItem;
  onCopy: (message: string) => void;
  onPublishNow: (id: string) => void;
  onSchedule: (id: string, scheduledAt: string) => void;
}) {
  const [hook, setHook] = useState(item.exportPackage.recommended_hook || item.exportPackage.hook);
  const [caption, setCaption] = useState(item.exportPackage.caption);
  const [hashtags, setHashtags] = useState(item.exportPackage.hashtags.join(" "));
  const [scheduledAt, setScheduledAt] = useState("");
  const canSendToMetricool = READY_PUBLISH_STATUSES.has(item.publishStatus);
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
      className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#0a0a0a] shadow-[0_24px_70px_rgba(0,0,0,0.42)]"
    >
      <div className="grid grid-cols-[112px_1fr] gap-4 p-3">
        <div className="relative h-[156px] overflow-hidden rounded-[18px] bg-[#111111]">
          {item.thumbnailUrl && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${item.thumbnailUrl})` }} />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/72 to-transparent" />
          <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-xs font-black text-white">{formatDuration(item.durationSeconds)}</span>
        </div>
        <div className="min-w-0 py-1 pr-1">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#ff4d00]">{item.sourceName}</p>
          <h2 className="mt-1 line-clamp-3 text-xl font-black leading-[1.02] tracking-tight">{item.title}</h2>
          <p className="mt-2 truncate text-xs font-black text-white/36">{formatApprovedAt(item.approvedAt)}</p>
          <p className="mt-2 w-fit rounded-full border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white/58">
            {metricoolStatusLabel(item.publishStatus)}
          </p>
        </div>
      </div>

      <div className="border-t border-white/[0.07] px-3 py-3">
        <label className="block text-[11px] font-black uppercase tracking-[0.16em] text-white/38">Hook</label>
        <input
          value={hook}
          onChange={(event) => setHook(event.target.value)}
          className="mt-2 h-11 w-full rounded-[14px] border border-white/[0.08] bg-white/[0.06] px-3 text-sm font-bold text-white outline-none focus:border-[#ff4d00]/70"
        />
        <label className="mt-3 block text-[11px] font-black uppercase tracking-[0.16em] text-white/38">Caption</label>
        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          rows={4}
          className="mt-2 w-full resize-none rounded-[14px] border border-white/[0.08] bg-white/[0.06] p-3 text-sm font-semibold leading-5 text-white outline-none focus:border-[#ff4d00]/70"
        />
        <label className="mt-3 block text-[11px] font-black uppercase tracking-[0.16em] text-white/38">Hashtags</label>
        <input
          value={hashtags}
          onChange={(event) => setHashtags(event.target.value)}
          className="mt-2 h-11 w-full rounded-[14px] border border-white/[0.08] bg-white/[0.06] px-3 text-sm font-bold text-white outline-none focus:border-[#ff4d00]/70"
        />
        <label className="mt-3 block text-[11px] font-black uppercase tracking-[0.16em] text-white/38">Schedule time</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
          disabled={!canSendToMetricool}
          className="mt-2 h-11 w-full rounded-[14px] border border-white/[0.08] bg-white/[0.06] px-3 text-sm font-bold text-white outline-none focus:border-[#ff4d00]/70 disabled:opacity-45"
        />
        <div className="mt-3 grid grid-cols-[1fr_1fr_1fr_1.2fr_1.2fr] gap-2">
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
            onClick={() => onPublishNow(item.id)}
            disabled={!canSendToMetricool}
            className="h-12 rounded-[14px] bg-white text-xs font-black text-black active:scale-[0.98] disabled:opacity-45"
          >
            Now
          </button>
          <button
            type="button"
            onClick={() => scheduledAt ? onSchedule(item.id, scheduledAt) : onCopy("Schedule time required")}
            disabled={!canSendToMetricool}
            className="grid h-12 place-items-center rounded-[14px] bg-[#ff4d00] text-black active:scale-[0.98] disabled:opacity-45"
            aria-label="Schedule in Metricool"
            title="Schedule in Metricool"
          >
            <CalendarClock className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.article>
  );
}

function metricoolStatusLabel(status: PublishStatus) {
  if (status === "metricool_published" || status === "manually_published") return "Metricool publish sent";
  if (status === "metricool_scheduled") return "Metricool scheduled";
  if (status === "metricool_failed") return "Metricool failed";
  if (READY_PUBLISH_STATUSES.has(status)) return "Approved";
  return "Not ready";
}

function SourcesScreen({
  sources,
  selectedSource,
  onSelectSource,
}: {
  sources: SourceFilterOption[];
  selectedSource: string;
  onSelectSource: (value: string) => void;
}) {
  const total = sources.reduce((sum, item) => sum + item.pending_count, 0);
  return (
    <PageShell eyebrow="Signals" title="Sources" trailing={<Radio className="h-5 w-5 text-[#ff4d00]" />}>
      <div className="grid grid-cols-2 gap-3">
        <MetricCard value={String(sources.length)} label="Live sources" />
        <MetricCard value={String(total)} label="Pending clips" />
      </div>
      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onSelectSource("")}
          className={`flex min-h-16 items-center justify-between rounded-[24px] border px-4 text-left active:scale-[0.99] ${
            selectedSource === "" ? "border-[#ff4d00]/70 bg-[#ff4d00]/14" : "border-white/[0.08] bg-[#0a0a0a]"
          }`}
        >
          <div>
            <p className="text-base font-black">All sources</p>
            <p className="mt-1 text-sm font-semibold text-white/44">Unified operator queue</p>
          </div>
          <ChevronRight className="h-5 w-5 text-white/38" />
        </button>
        {sources.map((item) => (
          <button
            key={`${item.source_name}-${item.source_type}`}
            type="button"
            onClick={() => onSelectSource(item.source_name)}
            className={`flex min-h-18 items-center gap-4 rounded-[24px] border p-4 text-left active:scale-[0.99] ${
              selectedSource === item.source_name ? "border-[#ff4d00]/70 bg-[#ff4d00]/14" : "border-white/[0.08] bg-[#0a0a0a]"
            }`}
          >
            <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-white/[0.07] text-xs font-black">
              {SOURCE_CODES[item.source_type?.toLowerCase()] ?? "RB"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-black">{item.source_name}</p>
              <p className="mt-1 text-sm font-semibold text-white/44">
                {item.source_type} · {item.status} · {item.last_ingested_at ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.last_ingested_at)) : "never ingested"}
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-black">{item.pending_count}</span>
          </button>
        ))}
      </div>
    </PageShell>
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
      className="hide-scrollbar min-h-dvh overflow-y-auto bg-black px-4 pb-[calc(env(safe-area-inset-bottom,0px)+104px)] pt-[calc(env(safe-area-inset-top,0px)+18px)]"
    >
      <header className="sticky top-0 z-20 -mx-4 mb-5 border-b border-white/[0.06] bg-black/84 px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+6px)] backdrop-blur-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff4d00]">{eyebrow}</p>
            <h1 className="mt-1 text-4xl font-black leading-none tracking-tight">{title}</h1>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-full border border-white/[0.08] bg-white/[0.055]">
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
    <div className="rounded-[26px] border border-white/[0.08] bg-[#0a0a0a] p-4">
      <p className="text-3xl font-black leading-none tracking-tight">{value}</p>
      <p className="mt-2 text-sm font-bold text-white/44">{label}</p>
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
      className="grid h-12 min-w-12 place-items-center rounded-[18px] border border-white/[0.08] bg-white/[0.07] text-white active:scale-95"
    >
      {children}
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative grid min-h-[430px] place-items-center overflow-hidden rounded-[34px] border border-white/[0.08] bg-[#050505] px-8 text-center shadow-[0_30px_90px_rgba(0,0,0,0.48)]">
      <div className="absolute inset-x-10 top-16 h-32 rounded-full bg-[#ff4d00]/10 blur-3xl" />
      <div className="relative">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] border border-white/[0.08] bg-white/[0.06] shadow-[0_20px_60px_rgba(255,77,0,0.12)]">
          <Check className="h-9 w-9 text-[#ff4d00]" />
        </div>
        <p className="mt-6 text-4xl font-black leading-none tracking-tight">{title}</p>
        <p className="mx-auto mt-3 max-w-[260px] text-sm font-semibold leading-6 text-white/52">{body}</p>
      </div>
    </div>
  );
}

function LiveEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid h-full min-h-dvh place-items-center bg-black px-8 text-center">
      <div>
        <p className="text-[24px] font-normal lowercase tracking-[-0.02em] text-[var(--rb-text)]">{title}</p>
        <span className="mx-auto mt-5 block h-px w-14 bg-[var(--rb-accent)]" />
        <p className="mx-auto mt-6 max-w-[220px] text-[13px] font-normal lowercase leading-5 text-[var(--rb-muted)]">{body}</p>
        <div className="mx-auto mt-8 flex w-fit items-center gap-2 text-[11px] lowercase text-[var(--rb-faint)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--rb-accent)] motion-safe:animate-[rbhq-live-breathe_1.8s_ease-in-out_infinite]" />
          live sources armed
        </div>
      </div>
    </div>
  );
}

function BottomNav({ active, onChange }: { active: AppTab; onChange: (tab: AppTab) => void }) {
  const items: Array<{ id: AppTab; label: string; icon: React.ReactNode }> = [
    { id: "queue", label: "Queue", icon: <ListVideo className="h-5 w-5" /> },
    { id: "publish", label: "Publish", icon: <Share className="h-5 w-5" /> },
    { id: "sources", label: "Sources", icon: <Radio className="h-5 w-5" /> },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[520px] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
      <div className="grid grid-cols-3 gap-1 rounded-[24px] border border-white/[0.08] bg-[#080808]/94 p-2 shadow-[0_-18px_60px_rgba(0,0,0,0.62)] backdrop-blur-2xl">
        {items.map((item) => {
          const selected = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[22px] text-[10px] font-black transition active:scale-95 ${
                selected ? "text-white" : "text-white/42"
              }`}
            >
              {selected && (
                <motion.span
                  layoutId="bottom-nav-pill"
                  className="absolute inset-0 rounded-[22px] bg-white/[0.10]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className={`relative ${selected ? "text-[#ff4d00]" : ""}`}>{item.icon}</span>
              <span className="relative truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
