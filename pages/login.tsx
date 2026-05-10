import { useState, useCallback, useEffect } from "react";

const DEFAULT_PIN = "000000";
const PAD = [[1,2,3],[4,5,6],[7,8,9],[null,0,"⌫"]] as const;

function getStoredPin(): string | null {
  try { return localStorage.getItem("rb_owner_pin"); } catch { return null; }
}
function savePin(pin: string) {
  try { localStorage.setItem("rb_owner_pin", pin); } catch {}
}

type Step = "passcode" | "set_pin" | "confirm_pin";

export default function LoginPage() {
  const [step,    setStep]    = useState<Step>("passcode");
  const [dots,    setDots]    = useState<number[]>([]);
  const [newPin,  setNewPin]  = useState("");
  const [hint,    setHint]    = useState(() => getStoredPin() ? "" : `Default PIN: ${DEFAULT_PIN}`);
  const [shake,   setShake]   = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [dark,    setDark]    = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, [dark]);

  function doShake(msg: string) {
    setHint(msg); setShake(true); setDots([]);
    setTimeout(() => setShake(false), 520);
  }

  async function loginToServer(pin: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.status === 429) {
        const data = await res.json() as { error: string };
        doShake(data.error ?? "Too many attempts");
        setBusy(false);
        return;
      }
      if (!res.ok) {
        doShake("Invalid PIN");
        setBusy(false);
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      doShake("Connection error");
      setBusy(false);
    }
  }

  const tap = useCallback((k: number | "⌫") => {
    if (busy) return;
    if (k === "⌫") { setDots(d => d.slice(0, -1)); setHint(""); return; }
    setDots(prev => {
      if (prev.length >= 6) return prev;
      const next = [...prev, k as number];
      if (next.length < 6) return next;
      const entered = next.join("");

      if (step === "passcode") {
        const localPin = getStoredPin() ?? DEFAULT_PIN;
        if (entered !== localPin) {
          setTimeout(() => doShake("Wrong PIN"), 0);
          return next;
        }
        if (!getStoredPin()) {
          setTimeout(() => { setDots([]); setHint(""); setStep("set_pin"); }, 200);
        } else {
          setTimeout(() => void loginToServer(entered), 100);
        }
      }

      if (step === "set_pin") {
        if (entered === DEFAULT_PIN) {
          setTimeout(() => doShake(`Can't use default PIN`), 0);
          return next;
        }
        setTimeout(() => { setNewPin(entered); setDots([]); setHint("Confirm new PIN"); setStep("confirm_pin"); }, 200);
      }

      if (step === "confirm_pin") {
        if (entered !== newPin) {
          setTimeout(() => { doShake("PINs don't match"); setNewPin(""); setStep("set_pin"); }, 0);
          return next;
        }
        savePin(entered);
        setTimeout(() => { setHint("✓ PIN saved"); void loginToServer(entered); }, 200);
      }

      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, step, newPin]);

  const STEP_LABEL: Record<Step, string> = {
    passcode:    "OWNER PIN",
    set_pin:     "SET NEW PIN",
    confirm_pin: "CONFIRM PIN",
  };

  return (
    <Shell dark={dark} onToggleTheme={() => setDark(d => !d)}>
      <div style={s.centerLabel}>RB·HQ OWNER ACCESS</div>

      <div style={s.stepLabel}>{STEP_LABEL[step]}</div>

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

      <div style={s.hintRow}>
        {hint && (
          <span style={{
            color: hint.startsWith("✓") ? "var(--accent)" : hint.startsWith("Default") ? "var(--fg2)" : "var(--reject)",
            fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 1,
          }}>{hint}</span>
        )}
      </div>

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

      <div style={s.footer}>
        {step === "passcode" && getStoredPin() && (
          <button style={s.footerBtn} onClick={() => {
            setDots([]); setNewPin(""); setHint(""); setStep("set_pin");
          }}>Change PIN</button>
        )}
        {(step === "set_pin" || step === "confirm_pin") && (
          <button style={s.footerBtn} onClick={() => {
            setDots([]); setHint(""); setNewPin(""); setStep("passcode");
          }}>Cancel</button>
        )}
      </div>

    </Shell>
  );
}

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

function Shell({ dark, onToggleTheme, children }: { dark: boolean; onToggleTheme: () => void; children: React.ReactNode }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", background:"var(--bg)", color:"var(--fg)", overflow:"hidden" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px 4px", flexShrink:0 }}>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--fg2)" }}>RB·HQ</span>
        <button onClick={onToggleTheme} style={{ border:"1px solid var(--border)", borderRadius:999, color:"var(--fg2)", fontFamily:"'JetBrains Mono',monospace", fontSize:10, padding:"2px 8px", letterSpacing:1 }}>
          {dark ? "☀" : "☾"}
        </button>
      </div>
      {children}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  centerLabel: { textAlign:"center", fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:3, color:"var(--fg2)", marginTop:32, flexShrink:0 },
  stepLabel:   { textAlign:"center", fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:4, color:"var(--fg2)", marginTop:40, flexShrink:0 },
  dotsRow:     { display:"flex", justifyContent:"center", gap:14, padding:"20px 0 0", flexShrink:0 },
  dot:         { width:13, height:13, borderRadius:"50%", transition:"all 0.14s ease" },
  hintRow:     { height:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:8 },
  padWrap:     { flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"4px 28px 0", minHeight:0, gap:0 },
  padRow:      { display:"flex", gap:10, justifyContent:"center", marginBottom:9 },
  padEmpty:    { flex:1, maxWidth:88 },
  padKey:      { flex:1, maxWidth:88, aspectRatio:"1 / 0.7", border:"1px solid var(--border)", borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.08s ease" },
  footer:      { display:"flex", justifyContent:"center", gap:32, padding:"6px 20px 20px", flexShrink:0 },
  footerBtn:   { fontFamily:"'JetBrains Mono',monospace", fontSize:10, letterSpacing:1, color:"var(--fg2)", textDecoration:"underline", textDecorationColor:"var(--fg3)", padding:"4px 0" },
};
