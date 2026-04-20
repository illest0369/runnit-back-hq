import { useRouter } from "next/router";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";

const TABS = [
  { label: "HOME",    icon: "≡",  href: "/dashboard"   },
  { label: "INTAKE",  icon: "↓",  href: "/intake"      },
  { label: "OPUS",    icon: "◈",  href: "/queue"       },
  { label: "PUBLISH", icon: "↑",  href: "/publish"     },
  { label: "STATS",   icon: "◎",  href: "/performance" },
] as const;

function useUnreadCount() {
  const [count, setCount] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch("/api/notifications", { credentials: "same-origin" });
        if (r.ok) {
          const d = await r.json() as { unread: number };
          setCount(d.unread);
        }
      } catch {}
    };
    poll();
    ref.current = setInterval(poll, 15_000);
    return () => clearInterval(ref.current);
  }, []);

  return count;
}

export default function BottomNav() {
  const { pathname } = useRouter();
  const unread = useUnreadCount();

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
      background: "rgba(8,8,8,0.92)",
      backdropFilter: "blur(16px)",
      borderTop: "1px solid var(--border)",
      display: "flex",
      paddingBottom: "max(var(--sab), 8px)",
    }}>
      {TABS.map(tab => {
        const active = pathname === tab.href || (tab.href === "/dashboard" && pathname === "/");
        const isHome = tab.href === "/dashboard";
        return (
          <Link key={tab.href} href={tab.href} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 3, padding: "10px 0 4px",
            textDecoration: "none",
            position: "relative",
          }}>
            {/* Icon with unread dot on HOME */}
            <span style={{ fontSize: 18, lineHeight: 1, color: active ? "var(--accent)" : "var(--fg3)", position: "relative" }}>
              {tab.icon}
              {isHome && unread > 0 && (
                <span style={{
                  position: "absolute", top: -4, right: -6,
                  width: 8, height: 8, borderRadius: "50%",
                  background: "var(--reject)",
                  border: "1.5px solid var(--bg)",
                }} />
              )}
            </span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 8, letterSpacing: 1.5,
              color: active ? "var(--accent)" : "var(--fg3)",
            }}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
