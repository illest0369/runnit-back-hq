import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import type { Clip } from "./api/clips";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";

const PIPELINE = ["trim", "track", "render", "upload", "score", "meta", "queue", "dedup"];
const GRADIENTS = [
  ["#1a1a2e", "#16213e", "#0f3460"],
  ["#2d1b00", "#4a2e00", "#1a0d00"],
  ["#0d1f0a", "#1a3a14", "#0a150a"],
  ["#1f0a0a", "#3a1414", "#150a0a"],
  ["#001a1a", "#003333", "#001010"],
];

function scoreColor(n: number) {
  return n >= 70 ? "#39ff14" : n >= 50 ? "#ffb400" : "#ff3b30";
}

function ScoreRingSVG({ score, size = 50 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ - (score / 100) * circ;
  const col = scoreColor(score);
  const cx = size / 2;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#1a1a1a" strokeWidth={3} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={col} strokeWidth={3}
        strokeDasharray={circ.toFixed(1)} strokeDashoffset={off.toFixed(1)}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`} />
      <text x={cx} y={cx + 1} textAnchor="middle" dominantBaseline="middle"
        fontFamily="Bebas Neue" fontSize={Math.round(size * 0.3)} fill={col}>{score}</text>
    </svg>
  );
}

function PlaceholderSVG({ id, channel, gi }: { id: string; channel: string; gi: number }) {
  const [g1, g2, g3] = GRADIENTS[gi % GRADIENTS.length];
  const s = id.replace(/[^a-z0-9]/gi, "");
  return (
    <svg width="100%" height="100%" viewBox="0 0 360 640" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`gc${s}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={g1} />
          <stop offset="50%" stopColor={g2} />
          <stop offset="100%" stopColor={g3} />
        </linearGradient>
        <linearGradient id={`go${s}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.75)" />
        </linearGradient>
      </defs>
      <rect width={360} height={640} fill={`url(#gc${s})`} />
      <rect width={360} height={640} fill={`url(#go${s})`} />
      <ellipse cx={180} cy={240} rx={55} ry={75} fill="rgba(255,255,255,0.04)" />
      <text x={16} y={20} fontFamily="JetBrains Mono" fontSize={8} fill="rgba(255,255,255,0.3)">
        r2://{channel}/{id}
      </text>
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
  const ovLeftRef = useRef<HTMLDivElement>(null);
  const ovRightRef = useRef<HTMLDivElement>(null);
  const THRESHOLD = 100;

  const isTop = stackIndex === 0;

  const tag = clip.decision === "approve_queue"
    ? "APPROVE QUEUE"
    : clip.decision.replace(/_/g, " ").toUpperCase();

  useEffect(() => {
    if (isTop && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [isTop]);

  const getX = (e: MouseEvent | TouchEvent) =>
    "touches" in e ? e.touches[0].clientX : e.clientX;

  const onStart = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isTop) return;
    startX.current = getX(e);
    currentX.current = 0;
    moved.current = false;
    active.current = true;
    cardRef.current?.classList.add("dragging");
  }, [isTop]);

  const onMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!active.current || !isTop) return;
    currentX.current = getX(e) - startX.current;
    if (Math.abs(currentX.current) > 5) moved.current = true;
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = `translateX(${currentX.current}px) rotate(${currentX.current / 18}deg) scale(1)`;
    if (ovLeftRef.current) ovLeftRef.current.style.opacity = String(Math.max(0, Math.min(1, currentX.current / THRESHOLD)));
    if (ovRightRef.current) ovRightRef.current.style.opacity = String(Math.max(0, Math.min(1, -currentX.current / THRESHOLD)));
    (e as Event).preventDefault();
  }, [isTop]);

  const onEnd = useCallback(() => {
    if (!active.current || !isTop) return;
    active.current = false;
    cardRef.current?.classList.remove("dragging");
    if (!moved.current) {
      if (cardRef.current) cardRef.current.style.transform = "";
      onDetail(clip);
      return;
    }
    if (currentX.current > THRESHOLD) {
      if (cardRef.current) cardRef.current.style.transform = "translateX(120%) rotate(30deg)";
      setTimeout(() => onApprove(clip), 320);
    } else if (currentX.current < -THRESHOLD) {
      if (cardRef.current) cardRef.current.style.transform = "translateX(-120%) rotate(-30deg)";
      setTimeout(() => onReject(clip), 320);
    } else {
      if (cardRef.current) cardRef.current.style.transform = "";
      if (ovLeftRef.current) ovLeftRef.current.style.opacity = "0";
      if (ovRightRef.current) ovRightRef.current.style.opacity = "0";
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
      position: "absolute", inset: 0,
      borderRadius: 16, overflow: "hidden",
      background: "var(--bg2)",
      cursor: isTop ? "grab" : "default",
      userSelect: "none",
      transition: "transform 0.32s cubic-bezier(.25,.46,.45,.94), box-shadow 0.32s",
      touchAction: "none",
      boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      transform: `scale(${1 - stackIndex * 0.035}) translateY(${stackIndex * 14}px)`,
      zIndex: 10 - stackIndex,
    }}>
      {/* Media */}
      <div style={{ position: "absolute", inset: 0, background: "#000" }}>
        {isTop && clip.cdn_url ? (
          <video ref={videoRef} src={clip.cdn_url} loop muted playsInline
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <PlaceholderSVG id={clip.id} channel={clip.channel} gi={clipIndex} />
        )}
      </div>

      {/* Overlays */}
      <div ref={ovLeftRef} style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: 0,
        background: "linear-gradient(to right,rgba(57,255,20,0.3),transparent)",
        display: "flex", alignItems: "center", justifyContent: "flex-start", paddingLeft: 24,
      }}>
        <div style={{ border: "3px solid var(--approve)", borderRadius: 8, padding: "6px 18px", transform: "rotate(-12deg)" }}>
          <span style={{ fontFamily: "Bebas Neue", fontSize: 48, color: "var(--approve)", letterSpacing: 2 }}>POST</span>
        </div>
      </div>
      <div ref={ovRightRef} style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: 0,
        background: "linear-gradient(to left,rgba(255,59,48,0.3),transparent)",
        display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 24,
      }}>
        <div style={{ border: "3px solid var(--reject)", borderRadius: 8, padding: "6px 18px", transform: "rotate(12deg)" }}>
          <span style={{ fontFamily: "Bebas Neue", fontSize: 48, color: "var(--reject)", letterSpacing: 2 }}>SKIP</span>
        </div>
      </div>

      {/* Bottom info */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "linear-gradient(to top,rgba(0,0,0,0.92) 0%,transparent 100%)",
        padding: "56px 18px 18px",
      }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "rgba(255,255,255,0.5)", marginBottom: 4, letterSpacing: 1 }}>{tag}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", lineHeight: 1.3, maxWidth: "82%" }}>{clip.hook || "—"}</div>
          </div>
          <ScoreRingSVG score={clip.score} size={50} />
        </div>
        <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
          {clip.id} · {clip.duration || "—"} · score {clip.score}
        </div>
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
  const [theme, setTheme] = useState("dark");
  const lastActionTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("rb_theme") || "dark" : "dark";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
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

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    if (typeof window !== "undefined") localStorage.setItem("rb_theme", next);
  };

  const showLastAction = (id: string, action: string) => {
    setLastAction({ id, action });
    clearTimeout(lastActionTimer.current);
    lastActionTimer.current = setTimeout(() => setLastAction(null), 3000);
  };

  const handleApprove = useCallback((clip: Clip) => {
    setClips(prev => prev.filter(c => c.id !== clip.id));
    showLastAction(clip.id, "approve");
    fetch("/api/approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: clip.id, action: "approve", channel: clip.channel }),
    }).catch(() => {});
  }, []);

  const handleReject = useCallback((clip: Clip) => {
    setClips(prev => prev.filter(c => c.id !== clip.id));
    showLastAction(clip.id, "reject");
    fetch("/api/approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: clip.id, action: "reject", channel: clip.channel }),
    }).catch(() => {});
  }, []);

  const handleDetail = useCallback((clip: Clip) => {
    const p = new URLSearchParams({
      id: clip.id, channel: clip.channel,
      url: clip.cdn_url || "", score: String(clip.score),
      decision: clip.decision, hook: clip.hook || "",
      kw: String(clip.kw), fit: String(clip.fit),
      dur: String(clip.dur_score), tx: String(clip.tx), dup: String(clip.dup),
    });
    router.push("/clip?" + p.toString());
  }, [router]);

  const pipeStep = Math.min(6, Math.max(3, 8 - clips.length));
  const visible = clips.slice(0, 3);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", flexDirection: "column" }}>
      {/* Stack area */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          position: "relative",
          width: "100%",
          maxWidth: "min(100vw, calc(100dvh * 9 / 16))",
          height: "100%",
          maxHeight: "min(100dvh, calc(100vw * 16 / 9))",
        }}>
          {loading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 2 }}>LOADING…</span>
            </div>
          )}
          {!loading && clips.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <div style={{ fontFamily: "Bebas Neue", fontSize: 64, color: "var(--accent)", letterSpacing: 2 }}>ALL CLEAR</div>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>queue empty · good work</div>
            </div>
          )}
          {visible.slice().reverse().map((clip, ri) => {
            const si = visible.length - 1 - ri;
            return (
              <Card key={clip.id} clip={clip} stackIndex={si}
                clipIndex={clips.indexOf(clip)}
                onApprove={handleApprove} onReject={handleReject} onDetail={handleDetail} />
            );
          })}
        </div>
      </div>

      {/* Top chrome */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 30,
        padding: "calc(var(--sat) + 10px) 16px 24px",
        background: "linear-gradient(to bottom,rgba(0,0,0,0.75) 0%,transparent 100%)",
        display: "flex", alignItems: "center", gap: 10, pointerEvents: "none",
      }}>
        <div style={{ pointerEvents: "auto", fontFamily: "Bebas Neue", fontSize: 28, lineHeight: 1, letterSpacing: 1, color: "#fff", flex: 1 }}>
          {auth.channel.toUpperCase() || "HQ"}<span style={{ color: "var(--accent)" }}>.</span>
        </div>
        {lastAction && (
          <div style={{
            pointerEvents: "auto",
            fontFamily: "JetBrains Mono", fontSize: 9, padding: "3px 10px", borderRadius: 999,
            background: lastAction.action === "approve" ? "rgba(57,255,20,0.2)" : "rgba(255,59,48,0.18)",
            color: lastAction.action === "approve" ? "#39ff14" : "#ff3b30",
            border: `1px solid ${lastAction.action === "approve" ? "rgba(57,255,20,0.4)" : "rgba(255,59,48,0.35)"}`,
          }}>
            {lastAction.action === "approve" ? "✓ POST" : "✕ SKIP"} {lastAction.id}
          </div>
        )}
        <div style={{ pointerEvents: "auto", width: 32, height: 32, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontFamily: "Bebas Neue", fontSize: 18, color: "var(--accent-fg)", lineHeight: 1 }}>
            {(auth.username[0] || "?").toUpperCase()}
          </span>
        </div>
        <div style={{ pointerEvents: "auto" }}><NotificationBell /></div>
        <button onClick={toggleTheme} style={{
          pointerEvents: "auto",
          background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 999, color: "rgba(255,255,255,0.7)",
          fontFamily: "JetBrains Mono", fontSize: 9, padding: "3px 8px", cursor: "pointer",
        }}>
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>

      {/* Bottom chrome */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 30,
        padding: "24px 20px calc(var(--sab) + 72px)",
        background: "linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 100%)",
        pointerEvents: "none",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "rgba(255,59,48,0.8)", letterSpacing: 1 }}>← SKIP</span>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>
            {clips.length === 0 ? "queue empty" : `${clips.length} in queue`}
          </span>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "rgba(57,255,20,0.8)", letterSpacing: 1 }}>POST →</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 8, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>PIPE</span>
          <div style={{ flex: 1, display: "flex", gap: 2 }}>
            {PIPELINE.map((seg, i) => (
              <div key={seg} title={seg} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: i < pipeStep ? "var(--accent)" : i === pipeStep ? "rgba(57,255,20,0.35)" : "rgba(255,255,255,0.15)",
              }} />
            ))}
          </div>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 8, color: "rgba(255,255,255,0.3)" }}>{pipeStep}/8</span>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
