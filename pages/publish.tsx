import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import BottomNav from "@/components/BottomNav";

interface PerfRecord {
  post_id: string;
  channel: string;
  operator: string;
  cdn_url: string;
  created_at: number;
  views: number;
  likes: number;
  shares: number;
  comments: number;
}

interface StatsData {
  totalPublished: number;
  avgEngagement: number;
  totalViews: number;
  totalLikes: number;
  viewsByClip: { post_id: string; views: number; created_at: number }[];
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function PublishLog() {
  const router = useRouter();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [clips, setClips] = useState<PerfRecord[]>([]);
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
        const r = await fetch("/api/stats", { credentials: "same-origin" });
        if (r.ok) {
          const d = await r.json();
          setStats(d);
          setClips(d.publishedClips || []);
        }
      } catch {}
      setLoading(false);
    })();
  }, [router]);

  const channelClips = clips.filter(c => !channel || c.channel === channel)
    .sort((a, b) => b.created_at - a.created_at);

  const scheduledNext = "14:00 UTC";

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        padding: "calc(var(--sat) + 16px) 20px 0",
        background: "var(--bg)", flexShrink: 0, zIndex: 10,
      }}>
        <div style={{ marginBottom: 2 }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)", letterSpacing: 3, marginBottom: 2 }}>CONTENT MANAGER</div>
          <span style={{ fontFamily: "Bebas Neue", fontSize: 32, color: "var(--fg)", letterSpacing: 1 }}>PUBLISH LOG</span>
        </div>
        <div style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--fg2)", marginBottom: 16 }}>
          {channel.toUpperCase()} · all published content
        </div>

        {/* Stats row */}
        {!loading && stats && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div style={{ background: "var(--bg2)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--border)" }}>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: 8, color: "var(--fg3)", letterSpacing: 1, marginBottom: 4 }}>TOTAL PUBLISHED</div>
              <div style={{ fontFamily: "Bebas Neue", fontSize: 28, color: "var(--accent)", lineHeight: 1 }}>
                {stats.totalPublished}
              </div>
            </div>
            <div style={{ background: "var(--bg2)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--border)" }}>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: 8, color: "var(--fg3)", letterSpacing: 1, marginBottom: 4 }}>AVG ENGAGEMENT</div>
              <div style={{ fontFamily: "Bebas Neue", fontSize: 28, color: "var(--accent)", lineHeight: 1 }}>
                {stats.avgEngagement}%
              </div>
            </div>
            <div style={{ background: "var(--bg2)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--border)" }}>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: 8, color: "var(--fg3)", letterSpacing: 1, marginBottom: 4 }}>SCHEDULED NEXT</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "pulse 2s infinite" }} />
                <span style={{ fontFamily: "Bebas Neue", fontSize: 18, color: "var(--fg)", lineHeight: 1 }}>{scheduledNext}</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ height: 1, background: "var(--border)" }} />
      </div>

      {/* Clip list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 150 }}>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: "var(--fg3)", letterSpacing: 2 }}>LOADING…</span>
          </div>
        ) : channelClips.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12 }}>
            <span style={{ fontFamily: "Bebas Neue", fontSize: 36, color: "var(--fg3)", letterSpacing: 2 }}>NO POSTS YET</span>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--fg3)" }}>publish clips from the queue</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {channelClips.map(clip => (
              <div key={clip.post_id} style={{
                background: "var(--bg2)", borderRadius: 12,
                border: "1px solid var(--border)", overflow: "hidden",
                display: "flex",
              }}>
                {/* Thumbnail */}
                <div style={{ width: 72, height: 80, background: "var(--bg3)", flexShrink: 0, position: "relative" }}>
                  {clip.cdn_url ? (
                    <video src={clip.cdn_url} muted playsInline
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#1a1a2e,#0f3460)" }} />
                  )}
                  {/* Live badge */}
                  <div style={{
                    position: "absolute", top: 5, left: 5,
                    background: "rgba(57,255,20,0.9)", borderRadius: 3, padding: "1px 5px",
                  }}>
                    <span style={{ fontFamily: "JetBrains Mono", fontSize: 7, color: "#000", letterSpacing: 1, fontWeight: 700 }}>LIVE</span>
                  </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, padding: "10px 12px", minWidth: 0 }}>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: 8, color: "var(--fg3)", marginBottom: 3 }}>
                    {clip.post_id} · {timeAgo(clip.created_at)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", lineHeight: 1.3, marginBottom: 8 }}>
                    {clip.channel.toUpperCase()} / {clip.operator}
                  </div>
                  {/* Stats row */}
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: "Bebas Neue", fontSize: 16, color: "var(--accent)", lineHeight: 1 }}>
                        {formatViews(clip.views || 0)}
                      </div>
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: 7, color: "var(--fg3)", letterSpacing: 1 }}>VIEWS</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: "Bebas Neue", fontSize: 16, color: "var(--fg)", lineHeight: 1 }}>
                        {formatViews(clip.likes || 0)}
                      </div>
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: 7, color: "var(--fg3)", letterSpacing: 1 }}>LIKES</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: "Bebas Neue", fontSize: 16, color: "var(--fg)", lineHeight: 1 }}>
                        {formatViews(clip.shares || 0)}
                      </div>
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: 7, color: "var(--fg3)", letterSpacing: 1 }}>SHARES</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: "Bebas Neue", fontSize: 16, color: "var(--fg)", lineHeight: 1 }}>
                        {formatViews(clip.comments || 0)}
                      </div>
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: 7, color: "var(--fg3)", letterSpacing: 1 }}>COMMENTS</div>
                    </div>
                  </div>
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
