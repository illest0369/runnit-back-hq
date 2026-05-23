import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import type { Clip } from "./api/clips";

const SURFACES = [
  ["#0b0b0a", "#171514", "#2a2520"],
  ["#090909", "#151515", "#24201d"],
  ["#0c0b0a", "#191613", "#302a24"],
  ["#080808", "#141312", "#252525"],
];

const UI = {
  bg: "#050505",
  ink: "#f3efe7",
  muted: "rgba(243,239,231,0.58)",
  faint: "rgba(243,239,231,0.32)",
  hairline: "rgba(243,239,231,0.14)",
  approve: "#d9d0bf",
  reject: "rgba(243,239,231,0.52)",
};

function timeLabel(ts: number) {
  if (!ts) return "just now";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <div style={{
      minWidth: 46,
      height: 30,
      borderRadius: 999,
      border: `1px solid ${UI.hairline}`,
      background: "rgba(8,8,8,0.42)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 10px",
      backdropFilter: "blur(14px)",
    }}>
      <span style={{ color: UI.ink, fontSize: 13, fontWeight: 600, letterSpacing: -0.2 }}>{score}</span>
    </div>
  );
}

function PlaceholderMedia({ id, gi }: { id: string; gi: number }) {
  const [a, b, c] = SURFACES[gi % SURFACES.length];
  const safeId = (id || "clip").replace(/[^a-z0-9]/gi, "");

  return (
    <svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`surface-${safeId}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="48%" stopColor={b} />
          <stop offset="100%" stopColor={c} />
        </linearGradient>
        <radialGradient id={`grain-${safeId}`} cx="50%" cy="36%" r="65%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
          <stop offset="58%" stopColor="rgba(255,255,255,0.02)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.36)" />
        </radialGradient>
      </defs>
      <rect width="390" height="844" fill={`url(#surface-${safeId})`} />
      <rect width="390" height="844" fill={`url(#grain-${safeId})`} />
      <path d="M78 594 C128 544 184 534 242 558 C284 576 318 616 334 684" fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="2" />
      <circle cx="292" cy="188" r="118" fill="rgba(255,255,255,0.026)" />
      <circle cx="305" cy="176" r="52" fill="rgba(0,0,0,0.10)" />
    </svg>
  );
}

interface CardProps {
  clip: Clip;
  stackIndex: number;
  clipIndex: number;
  onApprove: (clip: Clip) => void;
  onReject: (clip: Clip) => void;
  onDetail: (clip: Clip) => void;
}

function Card({ clip, stackIndex, clipIndex, onApprove, onReject, onDetail }: CardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const moved = useRef(false);
  const active = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const approveRef = useRef<HTMLDivElement>(null);
  const rejectRef = useRef<HTMLDivElement>(null);
  const threshold = 92;
  const isTop = stackIndex === 0;

  useEffect(() => {
    if (isTop && videoRef.current) videoRef.current.play().catch(() => {});
  }, [isTop]);

  const getX = (e: MouseEvent | TouchEvent) => "touches" in e ? e.touches[0].clientX : e.clientX;

  const onStart = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isTop) return;
    startX.current = getX(e);
    currentX.current = 0;
    moved.current = false;
    active.current = true;
  }, [isTop]);

  const onMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!active.current || !isTop) return;
    currentX.current = getX(e) - startX.current;
    if (Math.abs(currentX.current) > 5) moved.current = true;

    const el = cardRef.current;
    if (!el) return;
    el.style.transform = `translateX(${currentX.current}px) rotate(${currentX.current / 32}deg)`;

    const approveOpacity = Math.max(0, Math.min(1, currentX.current / threshold));
    const rejectOpacity = Math.max(0, Math.min(1, -currentX.current / threshold));
    if (approveRef.current) approveRef.current.style.opacity = String(approveOpacity);
    if (rejectRef.current) rejectRef.current.style.opacity = String(rejectOpacity);
    (e as Event).preventDefault();
  }, [isTop]);

  const resetCard = () => {
    if (cardRef.current) cardRef.current.style.transform = "";
    if (approveRef.current) approveRef.current.style.opacity = "0";
    if (rejectRef.current) rejectRef.current.style.opacity = "0";
  };

  const onEnd = useCallback(() => {
    if (!active.current || !isTop) return;
    active.current = false;

    if (!moved.current) {
      resetCard();
      onDetail(clip);
      return;
    }

    if (currentX.current > threshold) {
      if (cardRef.current) cardRef.current.style.transform = "translateX(112%) rotate(8deg)";
      setTimeout(() => onApprove(clip), 260);
    } else if (currentX.current < -threshold) {
      if (cardRef.current) cardRef.current.style.transform = "translateX(-112%) rotate(-8deg)";
      setTimeout(() => onReject(clip), 260);
    } else {
      resetCard();
    }
  }, [isTop, clip, onApprove, onReject, onDetail]);

  useEffect(() => {
    if (!isTop) return;
    const el = cardRef.current;
    if (!el) return;

    el.addEventListener("mousedown", onStart as EventListener);
    el.addEventListener("mousemove", onMove as EventListener);
    el.addEventListener("mouseup", onEnd);
    el.addEventListener("mouseleave", onEnd);
    el.addEventListener("touchstart", onStart as EventListener, { passive: false });
    el.addEventListener("touchmove", onMove as EventListener, { passive: false });
    el.addEventListener("touchend", onEnd);

    return () => {
      el.removeEventListener("mousedown", onStart as EventListener);
      el.removeEventListener("mousemove", onMove as EventListener);
      el.removeEventListener("mouseup", onEnd);
      el.removeEventListener("mouseleave", onEnd);
      el.removeEventListener("touchstart", onStart as EventListener);
      el.removeEventListener("touchmove", onMove as EventListener);
      el.removeEventListener("touchend", onEnd);
    };
  }, [isTop, onStart, onMove, onEnd]);

  return (
    <div ref={cardRef} style={{
      position: "absolute",
      inset: stackIndex === 0 ? 0 : `${stackIndex * 8}px ${stackIndex * 5}px 0`,
      borderRadius: 30,
      overflow: "hidden",
      background: "#10100f",
      cursor: isTop ? "grab" : "default",
      userSelect: "none",
      touchAction: "none",
      transition: "transform 0.28s cubic-bezier(.22,.61,.36,1), opacity 0.28s ease",
      transform: `scale(${1 - stackIndex * 0.028}) translateY(${stackIndex * 12}px)`,
      opacity: 1 - stackIndex * 0.16,
      zIndex: 10 - stackIndex,
      boxShadow: stackIndex === 0 ? "0 28px 90px rgba(0,0,0,0.48)" : "none",
    }}>
      <div style={{ position: "absolute", inset: 0, background: "#050505" }}>
        {isTop && clip.cdn_url ? (
          <video ref={videoRef} src={clip.cdn_url} loop muted playsInline style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
          }} />
        ) : (
          <PlaceholderMedia id={clip.id} gi={clipIndex} />
        )}
      </div>

      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,rgba(0,0,0,0.40) 0%,rgba(0,0,0,0.02) 34%,rgba(0,0,0,0.08) 58%,rgba(0,0,0,0.82) 100%)", pointerEvents: "none" }} />

      <div ref={approveRef} style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: 0,
        background: "rgba(232,226,214,0.10)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ color: UI.ink, fontSize: 15, fontWeight: 500, letterSpacing: 0.2 }}>approve</span>
      </div>
      <div ref={rejectRef} style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: 0,
        background: "rgba(0,0,0,0.22)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ color: UI.muted, fontSize: 15, fontWeight: 500, letterSpacing: 0.2 }}>skip</span>
      </div>

      <div style={{ position: "absolute", left: 22, right: 22, bottom: 128, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div style={{ color: UI.muted, fontSize: 12, fontWeight: 500, letterSpacing: 0.2 }}>
            {clip.channel || "rb"} / {timeLabel(clip.created_at)}
          </div>
          <ScoreBadge score={clip.score} />
        </div>
        <div style={{ color: UI.ink, fontSize: 22, lineHeight: 1.08, letterSpacing: -0.7, fontWeight: 600, maxWidth: "92%" }}>
          {clip.hook || "Review this cut."}
        </div>
        <div style={{ color: UI.faint, fontSize: 12, lineHeight: 1.35, maxWidth: "86%" }}>
          {clip.duration ? `${clip.duration} cut` : "clip ready"} / score {clip.score}
        </div>
      </div>
    </div>
  );
}

function BottomActions({ clips, onApprove, onReject }: { clips: Clip[]; onApprove: (clip: Clip) => void; onReject: (clip: Clip) => void }) {
  const current = clips[0];

  return (
    <div style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 30,
      padding: "18px 20px calc(var(--sab) + 18px)",
      background: "linear-gradient(to top,rgba(5,5,5,0.96) 0%,rgba(5,5,5,0.76) 62%,transparent 100%)",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: UI.faint, fontSize: 12 }}>
        <span>{clips.length === 0 ? "queue clear" : `${clips.length} waiting`}</span>
        <span>tap card for detail</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button disabled={!current} onClick={() => current && onReject(current)} style={{
          height: 52,
          borderRadius: 18,
          border: `1px solid ${UI.hairline}`,
          background: "rgba(255,255,255,0.035)",
          color: UI.reject,
          fontSize: 15,
          fontWeight: 500,
        }}>skip</button>
        <button disabled={!current} onClick={() => current && onApprove(current)} style={{
          height: 52,
          borderRadius: 18,
          border: "1px solid rgba(232,226,214,0.32)",
          background: "rgba(232,226,214,0.12)",
          color: UI.approve,
          fontSize: 15,
          fontWeight: 600,
        }}>approve</button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [clips, setClips] = useState<Clip[]>([]);
  const [auth, setAuth] = useState({ username: "", channel: "" });
  const [loading, setLoading] = useState(true);
  const [lastAction, setLastAction] = useState<{ id: string; action: string } | null>(null);
  const lastActionTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/session", { credentials: "same-origin" });
        if (!r.ok) { router.push("/login"); return; }
        const s = await r.json();
        setAuth({ username: s.username || "", channel: s.channel || "" });
      } catch { router.push("/login"); return; }

      try {
        const r = await fetch("/api/clips", { credentials: "same-origin" });
        if (r.ok) {
          const d = await r.json();
          setClips(d.clips || []);
        }
      } catch {}
      setLoading(false);
    })();
  }, [router]);

  const showLastAction = (id: string, action: string) => {
    setLastAction({ id, action });
    clearTimeout(lastActionTimer.current);
    lastActionTimer.current = setTimeout(() => setLastAction(null), 2600);
  };

  const handleApprove = useCallback((clip: Clip) => {
    setClips(prev => prev.filter(c => c.id !== clip.id));
    showLastAction(clip.id, "approved");
    fetch("/api/approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: clip.id, action: "approve", channel: clip.channel }),
    }).catch(() => {});
  }, []);

  const handleReject = useCallback((clip: Clip) => {
    setClips(prev => prev.filter(c => c.id !== clip.id));
    showLastAction(clip.id, "skipped");
    fetch("/api/approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: clip.id, action: "reject", channel: clip.channel }),
    }).catch(() => {});
  }, []);

  const handleDetail = useCallback((clip: Clip) => {
    const p = new URLSearchParams({
      id: clip.id,
      channel: clip.channel,
      url: clip.cdn_url || "",
      score: String(clip.score),
      decision: clip.decision,
      hook: clip.hook || "",
      kw: String(clip.kw),
      fit: String(clip.fit),
      dur: String(clip.dur_score),
      tx: String(clip.tx),
      dup: String(clip.dup),
    });
    router.push("/clip?" + p.toString());
  }, [router]);

  const visible = clips.slice(0, 3);

  return (
    <div style={{ position: "fixed", inset: 0, background: UI.bg, color: UI.ink, overflow: "hidden", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% -12%,rgba(255,255,255,0.07),transparent 34%),#050505" }} />

      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 max(var(--sal), 0px)" }}>
        <div style={{ position: "relative", width: "100%", maxWidth: "min(100vw, calc(100dvh * 9 / 16))", height: "100dvh", maxHeight: "min(100dvh, calc(100vw * 16 / 9))" }}>
          {loading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: UI.muted, fontSize: 14 }}>
              Loading the room
            </div>
          )}

          {!loading && clips.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
              <div style={{ textAlign: "center", maxWidth: 260 }}>
                <div style={{ fontSize: 30, lineHeight: 1, letterSpacing: -0.9, fontWeight: 600, marginBottom: 12 }}>Caught up.</div>
                <div style={{ color: UI.muted, fontSize: 14, lineHeight: 1.5 }}>No clips are waiting for review.</div>
              </div>
            </div>
          )}

          {visible.slice().reverse().map((clip, ri) => {
            const stackIndex = visible.length - 1 - ri;
            return (
              <Card key={clip.id} clip={clip} stackIndex={stackIndex} clipIndex={clips.indexOf(clip)} onApprove={handleApprove} onReject={handleReject} onDetail={handleDetail} />
            );
          })}
        </div>
      </div>

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 30, padding: "calc(var(--sat) + 16px) 20px 42px", background: "linear-gradient(to bottom,rgba(5,5,5,0.92),rgba(5,5,5,0.45) 56%,transparent)", pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ color: UI.ink, fontSize: 15, fontWeight: 600, letterSpacing: -0.25 }}>RBHQ</div>
            <div style={{ color: UI.faint, fontSize: 12, marginTop: 4 }}>{auth.channel || "review"}</div>
          </div>
          <div style={{ textAlign: "right", color: UI.faint, fontSize: 12, lineHeight: 1.35 }}>
            <div>{auth.username || "operator"}</div>
            <div>{clips.length} in queue</div>
          </div>
        </div>
        {lastAction && (
          <div style={{ marginTop: 16, display: "inline-flex", border: `1px solid ${UI.hairline}`, borderRadius: 999, padding: "7px 11px", background: "rgba(8,8,8,0.48)", color: UI.muted, fontSize: 12, backdropFilter: "blur(12px)" }}>
            {lastAction.action} / {lastAction.id.slice(0, 8)}
          </div>
        )}
      </div>

      <BottomActions clips={clips} onApprove={handleApprove} onReject={handleReject} />
    </div>
  );
}
