import { useRouter } from "next/router";
import Link from "next/link";

const TABS = [
  { label: "HOME",    icon: "≡",  href: "/dashboard" },
  { label: "INTAKE",  icon: "↓",  href: "/intake"    },
  { label: "OPUS",    icon: "◈",  href: "/queue"     },
  { label: "PUBLISH", icon: "↑",  href: "/publish"   },
  { label: "STATS",   icon: "◎",  href: "/performance" },
] as const;

interface BottomNavProps {
  safeBottom?: string;
}

export default function BottomNav({ safeBottom = "0px" }: BottomNavProps) {
  const { pathname } = useRouter();

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
      background: "rgba(8,8,8,0.92)",
      backdropFilter: "blur(16px)",
      borderTop: "1px solid var(--border)",
      display: "flex",
      paddingBottom: `max(${safeBottom}, 8px)`,
    }}>
      {TABS.map(tab => {
        const active = pathname === tab.href || (tab.href === "/dashboard" && pathname === "/");
        return (
          <Link key={tab.href} href={tab.href} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 3, padding: "10px 0 4px",
            textDecoration: "none",
            color: active ? "var(--accent)" : "var(--fg3)",
            transition: "color 0.15s",
          }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{tab.icon}</span>
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
