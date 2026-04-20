import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import BottomNav from "@/components/BottomNav";

interface StatsData {
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalPublished: number;
  approvalRate: number;
  conversionRate: number;
  avgEngagement: number;
  totalPending: number;
  viewsByClip: { post_id: string; views: number; created_at: number }[];
  channels: Record<string, number>;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function Performance() {
  const router = useRouter();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState("");
  const [now, setNow] = useState("");

  useEffect(() => {
    setNow(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    (async () => {
      try {
        const r = await fetch("/api/session", { credentials: "same-origin" });
        if (!r.ok) { router.push("/login"); return; }
        const s = await r.json();
        setChannel(s.channel || "");
      } catch { router.push("/login"); return; }

      try {
        const r = await fetch("/api/stats", { credentials: "same-origin" });
        if (r.ok) setStats(await r.json());
      } catch {}
      setLoading(false);
    })();
  }, [router]);

  // Mini bar chart from viewsByClip
  const chartData = stats?.viewsByClip?.slice(-12) || [];
  const maxViews = Math.max(...chartData.map(d => d.views), 1);

  const metricCards = stats ? [
    { label: "TOTAL VIEWS", value: formatNum(stats.totalViews), sub: "+12.4%", subColor: "var(--accent)" },
    { label: "APPROVAL RATE", value: `${stats.approvalRate}%`, sub: "Stable", subColor: "var(--fg2)" },
    { label: "CONVERSION", value: `${stats.conversionRate}%`, sub: "New Peak", subColor: "var(--accent)" },
    { label: "AVG ENGAGEMENT", value: `${stats.avgEngagement}%`, sub: `${stats.totalPublished} clips`, subColor: "var(--fg2)" },
  ] : [];

  const channelEntries = stats ? Object.entries(stats.channels) : [];
  const totalChannelClips = channelEntries.reduce((s, [, n]) => s + n, 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        padding: "calc(var(--sat) + 16px) 20px 0",
        background: "var(--bg)", flexShrink: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)", letterSpacing: 3, marginBottom: 2 }}>LIVE STREAM</div>
            <span style={{ fontFamily: "Bebas Neue", fontSize: 32, color: "var(--fg)", letterSpacing: 1 }}>PERFORMANCE HUB</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "JetBrains Mono", fontSize: 8, color: "var(--fg3)", letterSpacing: 1, marginBottom: 2 }}>LAST UPDATED</div>
            <div style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--fg2)" }}>{now} UTC</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "pulse 2s infinite" }} />
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: "var(--accent)", letterSpacing: 1 }}>LIVE</span>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: "var(--fg3)" }}>
            · {channel.toUpperCase()} · real-time data
          </span>
        </div>
        <div style={{ height: 1, background: "var(--border)" }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: "var(--fg3)", letterSpacing: 2 }}>LOADING…</span>
          </div>
        ) : (
          <>
            {/* Metric cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {metricCards.map(card => (
                <div key={card.label} style={{
                  background: "var(--bg2)", borderRadius: 12, padding: "16px 16px 14px",
                  border: "1px solid var(--border)",
                }}>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: 8, color: "var(--fg3)", letterSpacing: 1.5, marginBottom: 8 }}>
                    {card.label}
                  </div>
                  <div style={{ fontFamily: "Bebas Neue", fontSize: 36, color: "var(--fg)", lineHeight: 1, marginBottom: 4 }}>
                    {card.value}
                  </div>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: card.subColor }}>
                    {card.sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Views over time chart */}
            <div style={{
              background: "var(--bg2)", borderRadius: 12, padding: "16px",
              border: "1px solid var(--border)", marginBottom: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)", letterSpacing: 2 }}>VIEWS PER CLIP</div>
                <div style={{
                  fontFamily: "JetBrains Mono", fontSize: 8, letterSpacing: 1,
                  padding: "3px 8px", background: "rgba(57,255,20,0.15)",
                  border: "1px solid rgba(57,255,20,0.3)", borderRadius: 4, color: "var(--accent)",
                }}>LIVE</div>
              </div>
              {chartData.length > 0 ? (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
                  {chartData.map((d, i) => {
                    const h = Math.max(4, (d.views / maxViews) * 80);
                    const isLast = i === chartData.length - 1;
                    return (
                      <div key={d.post_id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{
                          width: "100%", height: h,
                          background: isLast ? "var(--accent)" : "rgba(57,255,20,0.3)",
                          borderRadius: "3px 3px 0 0",
                          transition: "height 0.5s ease",
                        }} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: "var(--fg3)" }}>no data yet</span>
                </div>
              )}
              {/* Axis */}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 8, color: "var(--fg3)" }}>oldest</span>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 8, color: "var(--fg3)" }}>latest</span>
              </div>
            </div>

            {/* Channel breakdown */}
            <div style={{
              background: "var(--bg2)", borderRadius: 12, padding: "16px",
              border: "1px solid var(--border)", marginBottom: 16,
            }}>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)", letterSpacing: 2, marginBottom: 14 }}>CHANNEL BREAKDOWN</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {channelEntries.map(([ch, count]) => {
                  const pct = totalChannelClips > 0 ? Math.round(count / totalChannelClips * 100) : 0;
                  return (
                    <div key={ch}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: "var(--fg2)", letterSpacing: 1 }}>{ch.toUpperCase()}</span>
                        <span style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: "var(--fg2)" }}>{count} clips · {pct}%</span>
                      </div>
                      <div style={{ height: 5, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: `${pct}%`,
                          background: ch === channel ? "var(--accent)" : "rgba(57,255,20,0.4)",
                          borderRadius: 3, transition: "width 0.6s ease",
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pending clips stat */}
            {stats && (
              <div style={{
                background: "var(--bg2)", borderRadius: 12, padding: "14px 16px",
                border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)", letterSpacing: 1, marginBottom: 4 }}>APPROVE QUEUE</div>
                  <div style={{ fontFamily: "Bebas Neue", fontSize: 32, color: "var(--accent)", lineHeight: 1 }}>{stats.totalPending}</div>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg2)", marginTop: 2 }}>clips ready to publish</div>
                </div>
                <button onClick={() => router.push("/queue")} style={{
                  fontFamily: "JetBrains Mono", fontSize: 9, letterSpacing: 1,
                  padding: "10px 16px", borderRadius: 10,
                  background: "var(--accent)", color: "var(--accent-fg)", border: "none",
                }}>VIEW QUEUE →</button>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
