import { useState, useEffect, useCallback } from "react";

// ── Config ─────────────────────────────────────────────────────────────────
const OPERATORS: Record<string, { channel: string; sigil: string; label: string; serverPwd: string }> = {
  manny: { channel: "sports", sigil: "S", label: "SPORTS", serverPwd: "sports123" },
  matt:  { channel: "arena",  sigil: "A", label: "ARENA",  serverPwd: "arena123"  },
  maly:  { channel: "women",  sigil: "W", label: "WOMEN",  serverPwd: "women123"  },
  agent: { channel: "combat", sigil: "C", label: "COMBAT", serverPwd: "combat123" },
};

const DEFAULT_PIN = "000000";
const PAD = [[1,2,3],[4,5,6],[7,8,9],[null,0,"⌫"]] as const;

// Steps: identify → select operator
//        passcode → enter PIN to login
//        change_verify → enter CURRENT PIN before changing
//        set_pin → enter new PIN
//        confirm_pin → confirm new PIN
type Step = "identify" | "passcode" | "change_verify" | "set_pin" | "confirm_pin";

// ── PIN helpers ──────────────────────────────────────────────────────────────
function getStoredPin(u: string): string | null {
  try { return localStorage.getItem(`rb_pin_${u}`); } catch { return null; }
}
function savePin(u: string, pin: string) {
  try { localStorage.setItem(`rb_pin_${u}`, pin); } catch {}
}
function clearPin(u: string) {
  try { localStorage.removeItem(`rb_pin_${u}`); } catch {}
}
function getStoredOperator(): string | null {
  try { return localStorage.getItem("rb_operator"); } catch { return null; }
}
function saveOperator(u: string) { try { localStorage.setItem("rb_operator", u); } catch {} }
function clearOperator()          { try { localStorage.removeItem("rb_operator"); } catch {} }

// ── Root ─────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [step,     setStep]     = useState<Step>("identify");
  const [username, setUsername] = useState("");
  const [dots,     setDots]     = useState<number[]>([]);
  const [newPin,   setNewPin]   = useState("");
  const [hint,     setHint]     = useState("");
  const [shake,    setShake]    = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [dark,     setDark]     = useState(true);

  useEffect(() => {
    const saved = getStoredOperator();
    if (saved && OPERATORS[saved]) { setUsername(saved); setStep("passcode"); }
    try { if (localStorage.getItem("rb_theme") === "light") setDark(false); } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    try { localStorage.setItem("rb_theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);

  const op = OPERATORS[username];

  function doShake(msg: string) {
    setHint(msg); setShake(true); setDots([]);
    setTimeout(() => setShake(false), 520);
  }

  async function loginToServer() {
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: op.serverPwd }),
      });
      if (!res.ok) { doShake("Auth error — contact admin"); setBusy(false); return; }
      window.location.href = "/dashboard";
    } catch { doShake("Connection error"); setBusy(false); }
  }

  function selectOperator(u: string) {
    setUsername(u); saveOperator(u);
    setDots([]); setNewPin(""); setHint("");
    const hasPin = !!getStoredPin(u);
    setHint(hasPin ? "" : `Default PIN: ${DEFAULT_PIN}`);
    setStep("passcode");
  }

  function resetPin() {
    clearPin(username); setDots([]);
    setHint(`PIN reset. Default PIN: ${DEFAULT_PIN}`);
    setStep("passcode");
  }

  function startChangePin() {
    setDots([]); setNewPin("");
    setHint("Enter current PIN to continue");
    setStep("change_verify");
  }

  const tap = useCallback((k: number | "⌫") => {
    if (busy) return;
    if (k === "⌫") { setDots(d => d.slice(0, -1)); setHint(""); return; }
    setDots(prev => {
      if (prev.length >= 6) return prev;
      const next = [...prev, k as number];
      if (next.length < 6) return next;
      const entered = next.join("");

      // ── passcode: login ────────────────────────────────────────────────
      if (step === "passcode") {
        const validPin = getStoredPin(username) ?? DEFAULT_PIN;
        if (entered !== validPin) {
          setTimeout(() => doShake("Wrong PIN"), 0);
          return next;
        }
        if (!getStoredPin(username)) {
          // First time — force PIN setup
          setTimeout(() => { setDots([]); setHint(""); setStep("set_pin"); }, 200);
        } else {
          setTimeout(() => void loginToServer(), 100);
        }
      }

      // ── change_verify: verify current PIN before changing ─────────────
      if (step === "change_verify") {
        const validPin = getStoredPin(username) ?? DEFAULT_PIN;
        if (entered !== validPin) {
          setTimeout(() => doShake("Wrong PIN"), 0);
          return next;
        }
        setTimeout(() => { setDots([]); setHint(""); setStep("set_pin"); }, 200);
      }

      // ── set_pin: choose new PIN ────────────────────────────────────────
      if (step === "set_pin") {
        if (entered === DEFAULT_PIN) {
          setTimeout(() => doShake(`Can't reuse ${DEFAULT_PIN}`), 0);
          return next;
        }
        setTimeout(() => { setNewPin(entered); setDots([]); setHint("Confirm your new PIN"); setStep("confirm_pin"); }, 200);
      }

      // ── confirm_pin: confirm new PIN ───────────────────────────────────
      if (step === "confirm_pin") {
        if (entered !== newPin) {
          setTimeout(() => { doShake("PINs don't match"); setNewPin(""); setStep("set_pin"); }, 0);
          return next;
        }
        savePin(username, entered);
        setTimeout(() => { setHint("✓ PIN saved"); void loginToServer(); }, 200);
      }

      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, step, username, newPin, op]);

  // ── Identify ──────────────────────────────────────────────────────────────
  if (step === "identify") {
    return (
      <Shell dark={dark} onToggleTheme={() => setDark(d => !d)}>
        <div style={s.identifyWrap}>
          <div style={s.whoLabel}>SELECT OPERATOR</div>
          <div style={s.avatarGrid}>
            {Object.entries(OPERATORS).map(([u, cfg]) => (
              <button key={u} style={s.avatarBtn} onClick={() => selectOperator(u)}>
                <div style={s.avatarCircle}>
                  <span style={s.avatarSigil}>{cfg.sigil}</span>
                </div>
                <div style={s.avatarName}>{u}</div>
                <div style={s.avatarTag}>{cfg.label}</div>
              </button>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  // ── PIN screen (passcode / change_verify / set_pin / confirm_pin) ─────────
  const STEP_LABEL: Record<Step, string> = {
    identify:       "",
    passcode:       "ENTER PIN",
    change_verify:  "CURRENT PIN",
    set_pin:        "SET NEW PIN",
    confirm_pin:    "CONFIRM PIN",
  };

  return (
    <Shell dark={dark} onToggleTheme={() => setDark(d => !d)}>
      {/* Operator strip */}
      <div style={s.opStrip}>
        <div style={s.opCircle}><span style={s.opSigil}>{op?.sigil ?? "?"}</span></div>
        <div>
          <div style={s.opName}>{username}</div>
          <div style={s.opTag}>{op?.label ?? ""}</div>
        </div>
        <div style={{ flex: 1 }} />
        <button style={s.switchBtn} onClick={() => { clearOperator(); setUsername(""); setDots([]); setHint(""); setNewPin(""); setStep("identify"); }}>
          SWITCH
        </button>
      </div>

      {/* Step label */}
      <div style={s.stepLabel}>{STEP_LABEL[step]}</div>

      {/* Dots */}
      <div style={{ ...s.dotsRow, animation: shake ? "shake 0.52s ease" : "none" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            ...s.dot,
            background: i < dots.length ? "var(--accent)" : "transparent",
            border: `2px solid ${i < dots.length ? "var(--accent)" : "var(--fg3)"}`,
            boxShadow: i < dots.length ? "0 0 10px var(--accent)" : "none",
          }} />
        ))}
      </div>

      {/* Hint */}
      <div style={s.hintRow}>
        {hint && (
          <span style={{
            color: hint.startsWith("✓") ? "var(--accent)" : hint.startsWith("Default") || hint.startsWith("PIN reset") ? "var(--fg2)" : "var(--reject)",
            fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 1,
          }}>{hint}</span>
        )}
      </div>

      {/* Numpad */}
      <div style={s.padWrap}>
        {PAD.map((row, ri) => (
          <div key={ri} style={s.padRow}>
            {row.map((k, ki) =>
              k === null
                ? <div key={ki} style={s.padEmpty} />
                : <PadKey key={ki} value={k as number | "⌫"} disabled={busy} onTap={tap} />
            )}
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div style={s.footer}>
        {step === "passcode" && (
          <>
            <button style={s.footerBtn} onClick={startChangePin}>Change PIN</button>
            <button style={s.footerBtn} onClick={resetPin}>Reset PIN</button>
          </>
        )}
        {(step === "change_verify" || step === "set_pin" || step === "confirm_pin") && (
          <button style={s.footerBtn} onClick={() => { setDots([]); setHint(""); setNewPin(""); setStep("passcode"); }}>
            Cancel
          </button>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          18%{transform:translateX(-9px)}
          36%{transform:translateX(9px)}
          54%{transform:translateX(-6px)}
          72%{transform:translateX(6px)}
        }
      `}</style>
    </Shell>
  );
}

// ── PadKey ───────────────────────────────────────────────────────────────────
function PadKey({ value, disabled, onTap }: { value: number | "⌫"; disabled: boolean; onTap: (k: number | "⌫") => void }) {
  const [pressed, setPressed] = useState(false);
  const isBack = value === "⌫";
  return (
    <button
      disabled={disabled}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onTap(value); }}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        ...s.padKey,
        background: isBack ? "transparent" : pressed ? "var(--accent)" : "var(--bg2)",
        color: pressed && !isBack ? "var(--accent-fg)" : "var(--fg)",
        transform: pressed ? "scale(0.91)" : "scale(1)",
        boxShadow: pressed && !isBack ? "0 0 18px var(--accent)" : "none",
        fontSize: isBack ? 22 : 28,
        fontFamily: isBack ? "Inter, sans-serif" : "'Bebas Neue', sans-serif",
      }}
    >
      {value}
    </button>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function Shell({ dark, onToggleTheme, children }: { dark: boolean; onToggleTheme: () => void; children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; touch-action:manipulation; }
        html, body { width:100%; height:100%; overflow:hidden; }
        [data-theme="dark"]  { --bg:#080808; --bg2:#111; --bg3:#1a1a1a; --fg:#f5f5f0; --fg2:rgba(245,245,240,0.5); --fg3:rgba(245,245,240,0.22); --accent:#39ff14; --accent-fg:#000; --border:rgba(245,245,240,0.1); --reject:#ff3b30; }
        [data-theme="light"] { --bg:#f0ede6; --bg2:#fff; --bg3:#e8e4dc; --fg:#080808; --fg2:rgba(8,8,8,0.5); --fg3:rgba(8,8,8,0.18); --accent:#1adb00; --accent-fg:#fff; --border:rgba(8,8,8,0.12); --reject:#ff3b30; }
        body { background:var(--bg); color:var(--fg); font-family:'Inter',sans-serif; }
        button { cursor:pointer; border:none; outline:none; user-select:none; background:none; }
        button:disabled { opacity:0.35; pointer-events:none; }
      `}</style>
      <div style={{ display:"flex", flexDirection:"column", height:"100dvh", background:"var(--bg)", color:"var(--fg)", overflow:"hidden" }}>
        {/* Status bar */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px 4px", flexShrink:0 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--fg2)" }}>9:41</span>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--accent)", letterSpacing:2 }}>RB·HQ</span>
          <button onClick={onToggleTheme} style={{ border:"1px solid var(--border)", borderRadius:999, color:"var(--fg2)", fontFamily:"'JetBrains Mono',monospace", fontSize:10, padding:"2px 8px", letterSpacing:1 }}>
            {dark ? "☀" : "☾"}
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  // Identify
  identifyWrap: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:28, padding:"0 24px" },
  whoLabel:     { fontFamily:"'JetBrains Mono',monospace", fontSize:11, letterSpacing:4, color:"var(--fg2)" },
  avatarGrid:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, width:"100%", maxWidth:300 },
  avatarBtn:    { display:"flex", flexDirection:"column", alignItems:"center", gap:10, padding:"22px 12px", background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:20 },
  avatarCircle: { width:60, height:60, borderRadius:"50%", background:"var(--accent)", display:"flex", alignItems:"center", justifyContent:"center" },
  avatarSigil:  { fontFamily:"'Bebas Neue',sans-serif", fontSize:34, color:"#000", lineHeight:1 },
  avatarName:   { fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"var(--fg)", letterSpacing:1 },
  avatarTag:    { fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"var(--fg2)", letterSpacing:2 },

  // Passcode
  opStrip:  { display:"flex", alignItems:"center", gap:12, padding:"10px 20px 4px", flexShrink:0 },
  opCircle: { width:42, height:42, borderRadius:"50%", background:"var(--accent)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:"0 0 18px rgba(57,255,20,0.28)" },
  opSigil:  { fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:"#000", lineHeight:1 },
  opName:   { fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:"var(--fg)", letterSpacing:1 },
  opTag:    { fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"var(--fg2)", letterSpacing:3 },
  switchBtn:{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:2, color:"var(--fg2)", border:"1px solid var(--border)", borderRadius:999, padding:"4px 10px" },

  stepLabel: { textAlign:"center", fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:4, color:"var(--fg2)", marginTop:8, flexShrink:0 },
  dotsRow:   { display:"flex", justifyContent:"center", gap:14, padding:"14px 0 0", flexShrink:0 },
  dot:       { width:13, height:13, borderRadius:"50%", transition:"all 0.14s ease" },
  hintRow:   { height:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:6 },

  padWrap: { flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"4px 28px 0", minHeight:0, gap:0 },
  padRow:  { display:"flex", gap:10, justifyContent:"center", marginBottom:9 },
  padEmpty:{ flex:1, maxWidth:88 },
  padKey:  { flex:1, maxWidth:88, aspectRatio:"1 / 0.7", border:"1px solid var(--border)", borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.08s ease" },

  footer:    { display:"flex", justifyContent:"center", gap:32, padding:"6px 20px 20px", flexShrink:0 },
  footerBtn: { fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:1, color:"var(--fg2)", textDecoration:"underline", textDecorationColor:"var(--fg3)", padding:"4px 0" },
};
