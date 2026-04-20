import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import ScoreRing from "@/components/ScoreRing";
import BottomNav from "@/components/BottomNav";

const GRADIENTS = [
  ["#1a1a2e", "#16213e", "#0f3460"],
  ["#2d1b00", "#4a2e00", "#1a0d00"],
  ["#0d1f0a", "#1a3a14", "#0a150a"],
  ["#1f0a0a", "#3a1414", "#150a0a"],
  ["#001a1a", "#003333", "#001010"],
];

function deriveReach(score: number): string {
  if (score >= 85) return "180K – 250K";
  if (score >= 70) return "120K – 180K";
  if (score >= 55) return "60K – 120K";
  return "20K – 60K";
}

function deriveVirality(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Aggressive", color: "#39ff14" };
  if (score >= 65) return { label: "Moderate", color: "#ffb400" };
  return { label: "Conservative", color: "#ff3b30" };
}

function derivePotential(score: number): string {
  if (score >= 80) return "High Potential · Trending";
  if (score >= 65) return "Solid Potential";
  return "Borderline — Review";
}

function PlaceholderSVG({ id, channel }: { id: string; channel: string }) {
  const [g1, g2, g3] = GRADIENTS[Math.abs((id.charCodeAt(3) || 0)) % GRADIENTS.length];
  const s = (id || "x").replace(/[^a-z0-9]/gi, "");
  return (
    <svg width="100%" height="100%" viewBox="0 0 360 640" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`gcp${s}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={g1} />
          <stop offset="50%" stopColor={g2} />
          <stop offset="100%" stopColor={g3} />
        </linearGradient>
        <linearGradient id={`gop${s}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.75)" />
        </linearGradient>
      </defs>
      <rect width={360} height={640} fill={`url(#gcp${s})`} />
      <rect width={360} height={640} fill={`url(#gop${s})`} />
      <ellipse cx={180} cy={240} rx={60} ry={80} fill="rgba(255,255,255,0.04)" />
      <text x={16} y={20} fontFamily="JetBrains Mono" fontSize={8} fill="rgba(255,255,255,0.3)">
        r2://{channel}/{id}
      </text>
    </svg>
  );
}

export default function ClipDetail() {
  const router = useRouter();
  const [playing, setPlaying] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  const q = router.query as Record<string, string>;
  const id = q.id || "";
  const url = q.url || "";
  const score = Number(q.score) || 0;
  const decision = q.decision || "";
  const hook = q.hook || "tap anywhere to play";
  const channel = q.channel || "";
  const kw = Number(q.kw) || 0;
  const fit = Number(q.fit) || 0;
  const dur = Number(q.dur) || 0;
  const tx = Number(q.tx) || 0;
  const dup = Number(q.dup) || 0;

  const reach = deriveReach(score);
  const virality = deriveVirality(score);
  const potential = derivePotential(score);

  useEffect(() => {
    fetch("/api/session", { credentials: "same-origin" })
      .then(r => { if (!r.ok) router.push("/login"); })
      .catch(() => router.push("/login"));
  }, [router]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const doAction = async (action: "approve" | "reject") => {
    setBusy(true);
    setStatus("…");
    try {
      const r = await fetch("/api/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: id, action, channel }),
      });
      if (r.ok) {
        setStatus(action === "approve" ? "posted ✓" : "skipped ✕");
        setTimeout(() => router.push("/dashboard"), 500);
        return;
      }
    } catch {}
    setStatus("");
    setBusy(false);
  };

  const scoreFactors: [string, number][] = [
    ["keyword", kw], ["channel fit", fit], ["duration", dur],
    ["transcript", tx], ["dup penalty", dup],
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      {/* Video / Placeholder bg */}
      <div style={{ position: "absolute", inset: 0 }}>
        {url ? (
          <video ref={videoRef} src={url} loop playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <PlaceholderSVG id={id} channel={channel} />
        )}
      </div>

      {/* Gradient overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 30%,transparent 50%,rgba(0,0,0,0.85) 100%)",
      }} />

      {/* Status bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 20px 4px",
        fontFamily: "JetBrains Mono", fontSize: 11, color: "rgba(245,245,240,0.5)",
      }}>
        <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        <span style={{ color: "var(--accent)", letterSpacing: 2 }}>RB·HQ</span>
        <span style={{ opacity: 0 }}>—</span>
      </div>

      {/* Top meta */}
      <div style={{
        position: "absolute", top: 44, left: 0, right: 0, zIndex: 20,
        display: "flex", alignItems: "center", gap: 12, padding: "0 20px",
      }}>
        <button onClick={() => router.push("/dashboard")} style={{
          width: 40, height: 40, borderRadius: "50%",
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.3)", color: "#fff",
          fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
        }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>{id}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: 500, marginTop: 2 }}>
            {status || (decision || "").replace(/_/g, " ")}
          </div>
        </div>
        <ScoreRing score={score} size={48} />
      </div>

      {/* Play button */}
      {url && (
        <button onClick={togglePlay} style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: 72, height: 72, borderRadius: "50%", zIndex: 10,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
          border: "2px solid rgba(255,255,255,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: playing ? 0 : 1, transition: "opacity 0.2s",
          pointerEvents: playing ? "none" : "auto",
        }}>
          <div style={{ width: 0, height: 0, borderTop: "16px solid transparent", borderBottom: "16px solid transparent", borderLeft: "23px solid #fff", marginLeft: 6 }} />
        </button>
      )}

      {/* Bottom sheet */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20,
        background: "var(--bg2)", borderRadius: "20px 20px 0 0",
        border: "1px solid var(--border)", borderBottom: "none",
        transform: sheetOpen ? "translateY(0)" : "translateY(calc(100% - 140px))",
        transition: "transform 0.4s cubic-bezier(.25,.46,.45,.94)",
        maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Handle */}
        <div onClick={() => setSheetOpen(o => !o)} style={{ padding: "12px 0 8px", display: "flex", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 4, background: "var(--fg3)" }} />
        </div>

        {/* Performance prediction panel */}
        <div style={{ padding: "0 20px 16px", flexShrink: 0 }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg2)", letterSpacing: 2, marginBottom: 10 }}>PERFORMANCE PREDICTION</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Score large */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontFamily: "Bebas Neue", fontSize: 48, color: "var(--accent)", lineHeight: 1 }}>{score}</span>
              <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: "var(--fg2)" }}>/100</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: "var(--fg2)", marginBottom: 4 }}>{potential}</div>
              {/* Reach */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)", width: 44 }}>REACH</span>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--fg)", fontWeight: 700 }}>{reach}</span>
              </div>
              {/* Virality */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)", width: 44 }}>VIRAL</span>
                <span style={{
                  fontFamily: "JetBrains Mono", fontSize: 9, letterSpacing: 1,
                  padding: "2px 8px", borderRadius: 4,
                  background: `${virality.color}22`,
                  border: `1px solid ${virality.color}55`,
                  color: virality.color,
                }}>{virality.label}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hook text */}
        <div style={{ padding: "0 20px 16px", flexShrink: 0, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg2)", letterSpacing: 2, marginBottom: 6, marginTop: 12 }}>VIDEO HOOK</div>
          <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: "var(--fg)" }}>{hook}</div>
        </div>

        {/* Score breakdown */}
        <div style={{ padding: "0 20px", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg2)", letterSpacing: 2, marginBottom: 10 }}>
            SCORE BREAKDOWN · {score}
          </div>
          {scoreFactors.map(([label, val]) => {
            const neg = val < 0;
            const fw = neg ? Math.abs(val) * 50 : val * 100;
            const fl = neg ? `${50 + val * 50}%` : "0";
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg2)", width: 80, flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, height: 6, background: "var(--bg3)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                  <div style={{
                    position: "absolute", top: 0, bottom: 0, left: fl, width: `${fw}%`,
                    borderRadius: 3, background: neg ? "var(--reject)" : "var(--accent)",
                    transition: "width 0.5s ease",
                  }} />
                </div>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg)", width: 34, textAlign: "right" }}>
                  {val > 0 ? "+" : ""}{Number(val).toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ padding: "16px 20px 80px", display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={() => doAction("reject")} disabled={busy} style={{
            flex: 1, height: 54, borderRadius: 12,
            background: "rgba(255,59,48,0.12)", border: "1px solid var(--reject)",
            color: "var(--reject)", fontFamily: "Bebas Neue", fontSize: 20, letterSpacing: 2,
          }}>✕ SKIP</button>
          <button onClick={() => doAction("approve")} disabled={busy} style={{
            flex: 2, height: 54, borderRadius: 12,
            background: "var(--accent)", border: "none",
            color: "var(--accent-fg)", fontFamily: "Bebas Neue", fontSize: 20, letterSpacing: 2,
            boxShadow: "0 0 24px rgba(57,255,20,0.3)",
          }}>✓ POST IT</button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
