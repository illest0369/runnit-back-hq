import { FormEvent, useState, useEffect } from "react";

const CHANNEL_CONFIG: Record<string, { color: string; sigil: string; label: string; accentFg: string }> = {
  sports: { color: "#39ff14", sigil: "S", label: "SPORTS", accentFg: "#000" },
  arena:  { color: "#39ff14", sigil: "A", label: "ARENA",  accentFg: "#000" },
  women:  { color: "#39ff14", sigil: "W", label: "WOMEN",  accentFg: "#000" },
  combat: { color: "#39ff14", sigil: "C", label: "COMBAT", accentFg: "#000" },
};

const OPERATORS: Record<string, string> = {
  manny: "sports",
  matt:  "arena",
  maly:  "women",
  agent: "combat",
};

const CHANNEL_STATS: Record<string, string> = {
  sports: "142 QUEUED · 38 POSTED · 1.2M REACH",
  arena:  "89 QUEUED · 21 POSTED · 840K REACH",
  women:  "114 QUEUED · 44 POSTED · 2.1M REACH",
  combat: "67 QUEUED · 15 POSTED · 390K REACH",
};

const PAD_ROWS = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [null, 0, "⌫"]] as const;

type Theme = "dark" | "light";

interface IdentifyStepProps {
  theme: Theme;
  onIdentify: (username: string, channel: string) => void;
}

interface PasscodeStepProps {
  username: string;
  channel: string;
  theme: Theme;
  onToggleTheme: () => void;
  onSwitch: () => void;
}

export default function LoginPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [step, setStep] = useState<"identify" | "passcode">("identify");
  const [username, setUsername] = useState("");
  const [channel, setChannel] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("rb_operator");
    if (stored && OPERATORS[stored]) {
      setUsername(stored);
      setChannel(OPERATORS[stored]);
      setStep("passcode");
    }
    const savedTheme = localStorage.getItem("rb_theme") as Theme | null;
    if (savedTheme) setTheme(savedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.className = theme === "light" ? "light" : "";
    localStorage.setItem("rb_theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(t => t === "dark" ? "light" : "dark");
  }

  function handleIdentify(u: string, ch: string) {
    setUsername(u);
    setChannel(ch);
    localStorage.setItem("rb_operator", u);
    setStep("passcode");
  }

  function handleSwitch() {
    localStorage.removeItem("rb_operator");
    setUsername("");
    setChannel("");
    setStep("identify");
  }

  const isDark = theme === "dark";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        html, body { width: 100%; height: 100%; overflow: hidden; }
        :root {
          --bg: #080808; --bg2: #111; --bg3: #1a1a1a;
          --fg: #f5f5f0; --fg2: rgba(245,245,240,0.5); --fg3: rgba(245,245,240,0.2);
          --accent: #39ff14; --accent-dim: rgba(57,255,20,0.12); --accent-fg: #000;
          --border: rgba(245,245,240,0.1); --reject: #ff3b30;
        }
        :root.light {
          --bg: #f0ede6; --bg2: #ffffff; --bg3: #e8e4dc;
          --fg: #080808; --fg2: rgba(8,8,8,0.5); --fg3: rgba(8,8,8,0.15);
          --accent: #1adb00; --accent-dim: rgba(26,219,0,0.1); --accent-fg: #fff;
          --border: rgba(8,8,8,0.12);
        }
        body { background: var(--bg); color: var(--fg); font-family: 'Inter', sans-serif; height: 100dvh; display: flex; flex-direction: column; }
        .bb { font-family: 'Bebas Neue', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        button { cursor: pointer; }
        button:active { opacity: 0.8; }
        input { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "var(--bg)", color: "var(--fg)", overflow: "hidden" }}>
        {/* Status bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px 4px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--fg2)", flexShrink: 0 }}>
          <span>9:41</span>
          <span style={{ fontSize: 10, color: "var(--accent)", letterSpacing: 2 }}>RB·HQ</span>
          <button
            onClick={toggleTheme}
            style={{ background: "none", border: "1px solid var(--border)", borderRadius: 999, color: "var(--fg2)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: "2px 8px", letterSpacing: 1 }}
          >
            {isDark ? "☀ LIGHT" : "☾ DARK"}
          </button>
        </div>

        {step === "identify" ? (
          <IdentifyStep theme={theme} onIdentify={handleIdentify} />
        ) : (
          <PasscodeStep username={username} channel={channel} theme={theme} onToggleTheme={toggleTheme} onSwitch={handleSwitch} />
        )}
      </div>
    </>
  );
}

function IdentifyStep({ onIdentify }: IdentifyStepProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const u = value.trim().toLowerCase();
    const ch = OPERATORS[u];
    if (!ch) { setError("Unknown operator"); return; }
    onIdentify(u, ch);
  }

  return (
    <form onSubmit={handleSubmit} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px", gap: 20 }}>
      <div style={{ fontSize: 11, letterSpacing: 4, color: "var(--fg2)", fontFamily: "'JetBrains Mono', monospace" }}>WHO ARE YOU?</div>

      <div style={{ width: 100, height: 100, borderRadius: "50%", background: "var(--bg3)", border: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="bb" style={{ fontSize: 52, color: "var(--fg2)", lineHeight: 1 }}>?</span>
      </div>

      <input
        autoComplete="username"
        autoFocus
        onChange={e => { setValue(e.target.value); setError(""); }}
        placeholder="operator username"
        style={{ width: "100%", padding: "14px 16px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--fg)", fontSize: 14, outline: "none" }}
        type="text"
        value={value}
      />
      {error && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--reject)" }}>{error}</div>}

      <button style={{ width: "100%", padding: 16, background: "var(--accent)", border: "none", borderRadius: 12, color: "var(--accent-fg)", fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 2 }} type="submit">
        ENTER HQ
      </button>
    </form>
  );
}

function PasscodeStep({ username, channel, onSwitch }: PasscodeStepProps) {
  const [dots, setDots] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showText, setShowText] = useState(false);
  const [textPwd, setTextPwd] = useState("");

  const cfg = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG.sports;

  async function submit(pass: string) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: pass }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Wrong passcode");
        setDots([]);
        return;
      }
      window.location.href = "/dashboard.html";
    } catch {
      setError("Connection error");
      setDots([]);
    } finally {
      setSubmitting(false);
    }
  }

  function tap(n: number | "⌫") {
    if (submitting) return;
    if (n === "⌫") { setDots(d => d.slice(0, -1)); setError(""); return; }
    if (dots.length >= 6) return;
    const next = [...dots, n];
    setDots(next);
    if (next.length === 6) {
      void submit(next.join(""));
    }
  }

  async function handleTextSubmit(e: FormEvent) {
    e.preventDefault();
    if (!textPwd || submitting) return;
    await submit(textPwd);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}>
      {/* Identity block */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", gap: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: "var(--fg2)", fontFamily: "'JetBrains Mono', monospace" }}>YOU ARE</div>

        <div style={{ width: 120, height: 120, borderRadius: "50%", background: "var(--accent)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 60px rgba(57,255,20,0.25), 0 0 120px rgba(57,255,20,0.1)" }}>
          <span className="bb" style={{ fontSize: 72, color: cfg.accentFg, lineHeight: 1 }}>{cfg.sigil}</span>
          <div style={{ position: "absolute", bottom: -12, left: "50%", transform: "translateX(-50%)", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--fg)", whiteSpace: "nowrap" }}>
            {username}
          </div>
        </div>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <div className="bb" style={{ fontSize: 80, lineHeight: 0.9, letterSpacing: 2 }}>
            {cfg.label}<span style={{ color: "var(--accent)" }}>.</span>
          </div>
          <div className="mono" style={{ fontSize: 10, color: "var(--fg2)", marginTop: 8, letterSpacing: 2 }}>
            {CHANNEL_STATS[channel] ?? ""}
          </div>
        </div>

        {/* Dots */}
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: i < dots.length ? "var(--accent)" : "transparent", border: `2px solid ${i < dots.length ? "var(--accent)" : "var(--fg3)"}`, transition: "all 0.15s ease", boxShadow: i < dots.length ? "0 0 8px var(--accent)" : "none" }} />
          ))}
        </div>

        {error && <div className="mono" style={{ fontSize: 10, color: "var(--reject)", letterSpacing: 1 }}>{error}</div>}
      </div>

      {/* Numpad */}
      <div style={{ padding: "0 40px 48px", display: "flex", flexDirection: "column", gap: 8 }}>
        {showText ? (
          <form onSubmit={handleTextSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
            <input
              autoComplete="current-password"
              autoFocus
              onChange={e => setTextPwd(e.target.value)}
              placeholder="text password"
              style={{ padding: "14px 16px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--fg)", fontSize: 14, outline: "none" }}
              type="password"
              value={textPwd}
            />
            <button disabled={submitting || !textPwd} style={{ padding: 16, background: "var(--accent)", border: "none", borderRadius: 12, color: "var(--accent-fg)", fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 2 }} type="submit">
              {submitting ? "CHECKING…" : "ENTER HQ"}
            </button>
          </form>
        ) : (
          PAD_ROWS.map((row, ri) => (
            <div key={ri} style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {row.map((k, ki) =>
                k === null ? <div key={ki} style={{ flex: 1, maxWidth: 90 }} /> : (
                  <button
                    key={ki}
                    disabled={submitting}
                    onClick={() => tap(k as number | "⌫")}
                    style={{ flex: 1, maxWidth: 90, height: 64, background: k === "⌫" ? "transparent" : "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--fg)", fontFamily: k === "⌫" ? "Inter" : "'Bebas Neue', sans-serif", fontSize: k === "⌫" ? 20 : 28, transition: "all 0.1s" }}
                    onMouseDown={e => { (e.currentTarget.style.transform = "scale(0.94)"); }}
                    onMouseUp={e => { (e.currentTarget.style.transform = "scale(1)"); }}
                    onTouchEnd={e => { (e.currentTarget.style.transform = "scale(1)"); }}
                    onTouchStart={e => { (e.currentTarget.style.transform = "scale(0.94)"); }}
                  >
                    {k}
                  </button>
                )
              )}
            </div>
          ))
        )}

        <div style={{ textAlign: "center", marginTop: 8, display: "flex", justifyContent: "center", gap: 16 }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--fg2)", letterSpacing: 1 }}>
            not {username}?{" "}
            <span onClick={onSwitch} style={{ color: "var(--accent)", cursor: "pointer" }}>switch channel</span>
          </span>
          <span className="mono" style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 1, cursor: "pointer" }} onClick={() => setShowText(s => !s)}>
            {showText ? "use pad" : "text pwd"}
          </span>
        </div>
      </div>
    </div>
  );
}
