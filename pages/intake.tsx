import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import type { Clip } from "./api/clips";
import ScoreRing from "@/components/ScoreRing";
import BottomNav from "@/components/BottomNav";

const GRADIENTS = [
  ["#1a1a2e", "#16213e", "#0f3460"],
  ["#2d1b00", "#4a2e00", "#1a0d00"],
  ["#0d1f0a", "#1a3a14", "#0a150a"],
  ["#1f0a0a", "#3a1414", "#150a0a"],
  ["#001a1a", "#003333", "#001010"],
];

function ThumbnailSVG({ id, gi }: { id: string; gi: number }) {
  const [g1, g2, g3] = GRADIENTS[gi % GRADIENTS.length];
  const s = id.replace(/[^a-z0-9]/gi, "");
  return (
    <svg width="100%" height="100%" viewBox="0 0 90 160" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`ti${s}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={g1} />
          <stop offset="100%" stopColor={g3} />
        </linearGradient>
      </defs>
      <rect width={90} height={160} fill={`url(#ti${s})`} />
      <ellipse cx={45} cy={65} rx={16} ry={22} fill="rgba(255,255,255,0.06)" />
    </svg>
  );
}

function scoreColor(n: number) {
  return n >= 70 ? "#39ff14" : n >= 50 ? "#ffb400" : "#ff3b30";
}

export default function IntakeQueue() {
  const router = useRouter();
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "queued">("all");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/session", { credentials: "same-origin" });
        if (!r.ok) { router.push("/login"); return; }
        const s = await r.json();
        setChannel(s.channel || "");
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

  const filtered = clips.filter(c => {
    if (filter === "pending") return c.decision === "hold";
    if (filter === "queued") return c.decision === "approve_queue";
    return true;
  });

  const openClip = (clip: Clip) => {
    const p = new URLSearchParams({
      id: clip.id, channel: clip.channel,
      url: clip.cdn_url || "", score: String(clip.score),
      decision: clip.decision, hook: clip.hook || "",
      kw: String(clip.kw), fit: String(clip.fit),
      dur: String(clip.dur_score), tx: String(clip.tx), dup: String(clip.dup),
    });
    router.push("/clip?" + p.toString());
  };

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: "all", label: "ALL" },
    { key: "pending", label: "HOLD" },
    { key: "queued", label: "QUEUED" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        padding: "calc(var(--sat) + 16px) 20px 0",
        background: "var(--bg)", flexShrink: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
          <span style={{ fontFamily: "Bebas Neue", fontSize: 32, color: "var(--fg)", letterSpacing: 1 }}>INTAKE QUEUE</span>
          <span style={{
            fontFamily: "JetBrains Mono", fontSize: 10, padding: "2px 8px",
            background: "var(--accent)", color: "var(--accent-fg)", borderRadius: 4, letterSpacing: 1,
          }}>● LIVE</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--fg2)" }}>
            {loading ? "—" : `${filtered.length} PENDING CLIPS`}
          </span>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: "var(--fg3)", letterSpacing: 1 }}>
            {channel.toUpperCase()}
          </span>
        </div>
        {/* Filter pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              fontFamily: "JetBrains Mono", fontSize: 9, letterSpacing: 1.5,
              padding: "5px 12px", borderRadius: 999,
              background: filter === f.key ? "var(--accent)" : "var(--bg3)",
              color: filter === f.key ? "var(--accent-fg)" : "var(--fg2)",
              border: filter === f.key ? "none" : "1px solid var(--border)",
            }}>{f.label}</button>
          ))}
        </div>
        <div style={{ height: 1, background: "var(--border)" }} />
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: "var(--fg3)", letterSpacing: 2 }}>LOADING…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12 }}>
            <span style={{ fontFamily: "Bebas Neue", fontSize: 40, color: "var(--accent)", letterSpacing: 2 }}>ALL CLEAR</span>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--fg3)" }}>no clips in this filter</span>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {filtered.map((clip, i) => (
              <div key={clip.id} onClick={() => openClip(clip)} style={{
                background: "var(--bg2)", borderRadius: 12,
                border: "1px solid var(--border)", overflow: "hidden", cursor: "pointer",
              }}>
                {/* Thumbnail */}
                <div style={{ position: "relative", aspectRatio: "9/16", background: "#000" }}>
                  {clip.cdn_url ? (
                    <video src={clip.cdn_url} muted playsInline
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <ThumbnailSVG id={clip.id} gi={i} />
                  )}
                  {/* Score badge */}
                  <div style={{
                    position: "absolute", top: 8, right: 8,
                    background: "rgba(0,0,0,0.7)", borderRadius: 6, padding: "3px 7px",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{ fontFamily: "Bebas Neue", fontSize: 18, color: scoreColor(clip.score), lineHeight: 1 }}>{clip.score}</span>
                  </div>
                  {/* Decision badge */}
                  <div style={{
                    position: "absolute", bottom: 8, left: 8,
                    background: clip.decision === "approve_queue" ? "rgba(57,255,20,0.2)" : "rgba(255,180,0,0.2)",
                    border: `1px solid ${clip.decision === "approve_queue" ? "rgba(57,255,20,0.4)" : "rgba(255,180,0,0.4)"}`,
                    borderRadius: 4, padding: "2px 6px",
                  }}>
                    <span style={{
                      fontFamily: "JetBrains Mono", fontSize: 8, letterSpacing: 1,
                      color: clip.decision === "approve_queue" ? "#39ff14" : "#ffb400",
                    }}>
                      {clip.decision === "approve_queue" ? "QUEUED" : "HOLD"}
                    </span>
                  </div>
                </div>
                {/* Meta */}
                <div style={{ padding: "10px 12px 12px" }}>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)", marginBottom: 4, letterSpacing: 0.5 }}>
                    {clip.id}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", lineHeight: 1.3, marginBottom: 8 }}>
                    {clip.hook || "—"}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); openClip(clip); }} style={{
                    width: "100%", height: 32, borderRadius: 6,
                    background: "var(--accent)", color: "var(--accent-fg)",
                    fontFamily: "Bebas Neue", fontSize: 14, letterSpacing: 2,
                  }}>SCORE</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
