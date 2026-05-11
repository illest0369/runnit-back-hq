import type { NextApiRequest, NextApiResponse } from "next";
import { auditAuth, getClientIp } from "@/lib/audit";
import { createSessionPayload, encodeSession, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth";
import { logAuthEnvStatus } from "@/lib/env-audit";

// ── Brute-force protection (in-memory, resets on cold start) ─────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

interface AttemptRecord {
  count: number;
  lockedUntil: number;
}
const attempts = new Map<string, AttemptRecord>();

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

// ── Handler ───────────────────────────────────────────────────────────────────
type LoginBody = { pin?: string };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  logAuthEnvStatus();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const appPin = process.env.APP_PIN;
  const operatorUsername = process.env.OPERATOR_USERNAME ?? process.env.OWNER_USERNAME;
  const sessionSecret = process.env.SESSION_SECRET?.trim();

  if (!appPin) {
    return res.status(503).json({ error: "Server not configured: APP_PIN missing" });
  }
  if (!operatorUsername) {
    return res.status(503).json({ error: "Server not configured: OPERATOR_USERNAME missing" });
  }
  if (!sessionSecret || sessionSecret.length < 16) {
    return res.status(503).json({ error: "Server not configured: SESSION_SECRET missing" });
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
      auditAuth("login_failure", { ip, route: req.url, method: req.method, reason: "missing_pin" });
      return res.status(400).json({ error: "Missing PIN" });
    }

    if (pin !== appPin) {
      recordFailure(ip);
      auditAuth("login_failure", { ip, route: req.url, method: req.method, reason: "invalid_pin" });
      return res.status(401).json({ error: "Invalid PIN" });
    }

    clearAttempts(ip);

    const session = encodeSession(createSessionPayload(operatorUsername, "operator"));

    const cookie = [
      `${SESSION_COOKIE}=${session}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${SESSION_MAX_AGE_S}`,
    ].join("; ");

    res.setHeader("Set-Cookie", cookie);
    auditAuth("login_success", { ip, route: req.url, method: req.method, username: operatorUsername });
    return res.status(200).json({ username: operatorUsername, channel: "operator" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "Server error", detail: msg });
  }
}
