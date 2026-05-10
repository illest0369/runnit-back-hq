import type { NextApiRequest, NextApiResponse } from "next";

const SESSION_COOKIE = "rb_session";
const SESSION_MAX_AGE_S = 8 * 60 * 60; // 8 hours

// ── Brute-force protection (in-memory, resets on cold start) ─────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

interface AttemptRecord {
  count: number;
  lockedUntil: number;
}
const attempts = new Map<string, AttemptRecord>();

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function checkRateLimit(ip: string): { blocked: boolean; remainingMs: number } {
  const record = attempts.get(ip);
  if (!record) return { blocked: false, remainingMs: 0 };
  if (record.lockedUntil > Date.now()) {
    return { blocked: true, remainingMs: record.lockedUntil - Date.now() };
  }
  return { blocked: false, remainingMs: 0 };
}

function recordFailure(ip: string) {
  const record = attempts.get(ip) ?? { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MS;
    record.count = 0;
  }
  attempts.set(ip, record);
}

function clearAttempts(ip: string) {
  attempts.delete(ip);
}

// ── Session encoding ──────────────────────────────────────────────────────────
function encodeSession(payload: { username: string; channel: string; iat: number }): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

// ── Handler ───────────────────────────────────────────────────────────────────
type LoginBody = { pin?: string };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ownerPin = process.env.OWNER_PIN;
  const ownerUsername = process.env.OWNER_USERNAME;

  if (!ownerPin || !ownerUsername) {
    return res.status(503).json({ error: "Server not configured" });
  }

  const ip = getClientIp(req);
  const { blocked, remainingMs } = checkRateLimit(ip);

  if (blocked) {
    const waitSecs = Math.ceil(remainingMs / 1000);
    return res.status(429).json({ error: `Too many attempts. Try again in ${waitSecs}s` });
  }

  try {
    const body = (req.body ?? {}) as LoginBody;
    const pin = body.pin?.trim() ?? "";

    if (!pin) {
      return res.status(400).json({ error: "Missing PIN" });
    }

    if (pin !== ownerPin) {
      recordFailure(ip);
      return res.status(401).json({ error: "Invalid PIN" });
    }

    clearAttempts(ip);

    const session = encodeSession({
      username: ownerUsername,
      channel: "owner",
      iat: Date.now(),
    });

    const cookie = [
      `${SESSION_COOKIE}=${session}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${SESSION_MAX_AGE_S}`,
    ].join("; ");

    res.setHeader("Set-Cookie", cookie);
    return res.status(200).json({ username: ownerUsername, channel: "owner" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "Server error", detail: msg });
  }
}
