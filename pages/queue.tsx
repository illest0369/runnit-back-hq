import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import type { Clip } from "./api/clips";
import ScoreRing from "@/components/ScoreRing";
import BottomNav from "@/components/BottomNav";

const DAILY_QUOTA = 50;

function todayCount(clips: Clip[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = today.getTime() / 1000;
  return clips.filter(c => c.decision === "approve_queue" && c.created_at >= start).length;
}

function scoreColor(n: number) {
  return n >= 70 ? "#39ff14" : n >= 50 ? "#ffb400" : "#ff3b30";
}

export default function OpusQueue() {
  const router = useRouter();
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState("");

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
          const all: Clip[] = d.clips || [];
          setClips(all.filter(c => c.decision === "approve_queue"));
        }
      } catch {}
      setLoading(false);
    })();
  }, [router]);

  const used = todayCount(clips);
  const remaining = Math.max(0, DAILY_QUOTA - used);
  const quotaPct = Math.min(100, (used / DAILY_QUOTA) * 100);

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

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        padding: "calc(var(--sat) + 16px) 20px 0",
        background: "var(--bg)", flexShrink: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontFamily: "Bebas Neue", fontSize: 32, color: "var(--fg)", letterSpacing: 1 }}>OPUS QUEUE</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => router.push("/intake")} style={{
              fontFamily: "JetBrains Mono", fontSize: 9, letterSpacing: 1,
              padding: "5px 12px", borderRadius: 999,
              background: "var(--accent)", color: "var(--accent-fg)", border: "none",
            }}>+ ADD CLIP</button>
            <button style={{
              fontFamily: "JetBrains Mono", fontSize: 9, letterSpacing: 1,
              padding: "5px 12px", borderRadius: 999,
              background: "var(--bg3)", color: "var(--fg2)", border: "1px solid var(--border)",
            }}>FILTER</button>
          </div>
        </div>
        <div style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--fg2)", marginBottom: 16 }}>
          {channel.toUpperCase()} · {clips.length} CLIPS READY
        </div>

        {/* Daily quota */}
        <div style={{
          background: "var(--bg2)", borderRadius: 12, padding: "16px 16px 14px",
          border: "1px solid var(--border)", marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)", letterSpacing: 2 }}>DAILY QUOTA</span>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)", marginLeft: "auto" }}>
              resets at midnight
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12 }}>
            <span style={{ fontFamily: "Bebas Neue", fontSize: 48, color: "var(--accent)", lineHeight: 1 }}>{used}</span>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 16, color: "var(--fg2)" }}>/ {DAILY_QUOTA}</span>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: "var(--fg3)", marginLeft: 8 }}>
              {remaining} remaining
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 6, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${quotaPct}%`, borderRadius: 3,
              background: quotaPct >= 90 ? "var(--reject)" : quotaPct >= 70 ? "#ffb400" : "var(--accent)",
              transition: "width 0.6s ease",
            }} />
          </div>
        </div>

        <div style={{ height: 1, background: "var(--border)" }} />
      </div>

      {/* Clip list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 150 }}>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: "var(--fg3)", letterSpacing: 2 }}>LOADING…</span>
          </div>
        ) : clips.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12 }}>
            <span style={{ fontFamily: "Bebas Neue", fontSize: 40, color: "var(--fg3)", letterSpacing: 2 }}>QUEUE EMPTY</span>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--fg3)" }}>approve clips from the dashboard</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {clips.map((clip, i) => (
              <div key={clip.id} onClick={() => openClip(clip)} style={{
                background: "var(--bg2)", borderRadius: 12,
                border: "1px solid var(--border)", overflow: "hidden",
                display: "flex", cursor: "pointer", position: "relative",
              }}>
                {/* Left accent */}
                <div style={{ width: 3, background: scoreColor(clip.score), flexShrink: 0 }} />

                {/* Thumbnail */}
                <div style={{ width: 64, height: 72, background: "var(--bg3)", flexShrink: 0, overflow: "hidden" }}>
                  {clip.cdn_url ? (
                    <video src={clip.cdn_url} muted playsInline
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{
                      width: "100%", height: "100%",
                      background: `linear-gradient(135deg, #1a1a2e, #0f3460)`,
                    }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, padding: "10px 12px", minWidth: 0 }}>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: 8, color: "var(--fg3)", marginBottom: 3, letterSpacing: 0.5 }}>
                    #{String(i + 1).padStart(3, "0")} · {clip.id}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", lineHeight: 1.3, marginBottom: 5 }}>
                    {clip.hook || "—"}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{
                      fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)",
                      padding: "2px 6px", background: "var(--bg3)", borderRadius: 4,
                    }}>{clip.duration || "—"}</span>
                    <span style={{
                      fontFamily: "JetBrains Mono", fontSize: 9,
                      color: scoreColor(clip.score),
                    }}>SCORE {clip.score}</span>
                  </div>
                </div>

                {/* Score ring */}
                <div style={{ display: "flex", alignItems: "center", padding: "0 14px 0 8px" }}>
                  <ScoreRing score={clip.score} size={40} />
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
