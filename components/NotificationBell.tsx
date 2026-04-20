import { useState, useEffect, useRef } from "react";
import type { Notification } from "@/pages/api/notifications";

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TYPE_META = {
  approved: { label: "APPROVED", color: "#39ff14", icon: "✓" },
  rejected: { label: "REJECTED", color: "#ff3b30", icon: "✕" },
  scored:   { label: "SCORED",   color: "#ffb400", icon: "◎" },
  duplicate:{ label: "DUPLICATE",color: "#888",    icon: "⊗" },
} as const;

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchNotifs = async () => {
    try {
      const r = await fetch("/api/notifications", { credentials: "same-origin" });
      if (!r.ok) return;
      const d = await r.json() as { notifications: Notification[]; unread: number };
      setUnread(d.unread);
      setNotifs(d.notifications);
    } catch {}
  };

  useEffect(() => {
    fetchNotifs();
    intervalRef.current = setInterval(fetchNotifs, 15_000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const openPanel = () => {
    setOpen(true);
    // Mark all read
    fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "mark_read" }),
    }).then(() => { setUnread(0); setNotifs(n => n.map(x => ({ ...x, read: true }))); }).catch(() => {});
  };

  return (
    <>
      {/* Bell button */}
      <button onClick={open ? () => setOpen(false) : openPanel} style={{
        position: "relative",
        width: 36, height: 36,
        borderRadius: "50%",
        background: open ? "var(--accent)" : "var(--bg2)",
        border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        transition: "all 0.15s",
      }}>
        <span style={{ fontSize: 16, color: open ? "var(--accent-fg)" : "var(--fg2)" }}>🔔</span>
        {unread > 0 && (
          <div style={{
            position: "absolute", top: -3, right: -3,
            width: 16, height: 16, borderRadius: "50%",
            background: "var(--reject)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1.5px solid var(--bg)",
          }}>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "#fff", fontWeight: 700, lineHeight: 1 }}>
              {unread > 9 ? "9+" : unread}
            </span>
          </div>
        )}
      </button>

      {/* Slide-down panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div onClick={() => setOpen(false)} style={{
            position: "fixed", inset: 0, zIndex: 40,
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
          }} />

          {/* Panel */}
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0,
            width: "min(340px, 92vw)", zIndex: 50,
            background: "var(--bg2)",
            borderLeft: "1px solid var(--border)",
            display: "flex", flexDirection: "column",
            boxShadow: "-8px 0 32px rgba(0,0,0,0.5)",
          }}>
            {/* Header */}
            <div style={{
              padding: "calc(var(--sat) + 16px) 20px 16px",
              borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontFamily: "Bebas Neue", fontSize: 24, color: "var(--fg)", letterSpacing: 1 }}>NOTIFICATIONS</div>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)", letterSpacing: 1, marginTop: 2 }}>
                  {notifs.length === 0 ? "all clear" : `${notifs.length} recent`}
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "var(--bg3)", border: "1px solid var(--border)",
                color: "var(--fg2)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              }}>✕</button>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
              {notifs.length === 0 ? (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", height: 200, gap: 10,
                }}>
                  <span style={{ fontSize: 32 }}>🔔</span>
                  <span style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--fg3)" }}>no notifications yet</span>
                </div>
              ) : notifs.map(n => {
                const meta = TYPE_META[n.type] ?? TYPE_META.scored;
                return (
                  <div key={n.id} style={{
                    padding: "12px 20px",
                    borderBottom: "1px solid var(--border)",
                    background: n.read ? "transparent" : "rgba(57,255,20,0.04)",
                    display: "flex", gap: 12, alignItems: "flex-start",
                  }}>
                    {/* Icon */}
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                      background: `${meta.color}18`,
                      border: `1px solid ${meta.color}44`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ color: meta.color, fontSize: 14, fontWeight: 700 }}>{meta.icon}</span>
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{
                          fontFamily: "JetBrains Mono", fontSize: 8, letterSpacing: 1,
                          padding: "2px 6px", borderRadius: 4,
                          background: `${meta.color}18`, color: meta.color,
                          border: `1px solid ${meta.color}33`,
                        }}>{meta.label}</span>
                        {!n.read && (
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
                        )}
                      </div>
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--fg)", marginBottom: 2 }}>
                        {n.post_id}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "var(--fg3)" }}>
                          {n.channel.toUpperCase()} · score {n.score}
                        </span>
                      </div>
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: 8, color: "var(--fg3)", marginTop: 4 }}>
                        {timeAgo(n.timestamp)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
