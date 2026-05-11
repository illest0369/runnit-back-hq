import type { NextApiRequest } from "next";
import crypto from "crypto";
import { auditAuth, getClientIp } from "./audit";

export type SessionPayload = {
  username: string;
  channel: string;
  iat: number;
  exp: number;
};

export const SESSION_COOKIE = "rb_session";
export const SESSION_MAX_AGE_S = 8 * 60 * 60; // 8 hours

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export type SessionDecodeResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; reason: "missing" | "malformed" | "invalid_signature" | "expired" | "secret_missing" };

function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function createSessionPayload(username: string, channel = "operator", now = Date.now()): SessionPayload {
  return {
    username,
    channel,
    iat: now,
    exp: now + SESSION_MAX_AGE_S * 1000,
  };
}

export function encodeSession(payload: SessionPayload): string {
  const secret = getSessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is required for signed sessions");

  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(body, secret);
  return `${body}.${signature}`;
}

export function decodeSessionDetailed(value?: string): SessionDecodeResult {
  if (!value) return { ok: false, reason: "missing" };

  const secret = getSessionSecret();
  if (!secret) return { ok: false, reason: "secret_missing" };

  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }

  const [body, signature] = parts;
  const expected = signPayload(body, secret);
  if (!safeEqual(signature, expected)) {
    return { ok: false, reason: "invalid_signature" };
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed.username || !parsed.channel || !parsed.iat || !parsed.exp) {
      return { ok: false, reason: "malformed" };
    }
    if (Date.now() > parsed.exp) {
      return { ok: false, reason: "expired" };
    }
    return { ok: true, session: parsed };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export function decodeSession(value?: string): SessionPayload | null {
  const result = decodeSessionDetailed(value);
  return result.ok ? result.session : null;
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = rest.join("=");
    return acc;
  }, {});
}

export function getSessionFromRequest(req: NextApiRequest): SessionPayload | null {
  const cookies = parseCookies(req.headers.cookie);
  const result = decodeSessionDetailed(cookies[SESSION_COOKIE]);

  if (result.ok) return result.session;

  if (result.reason === "expired") {
    auditAuth("expired_session", { ip: getClientIp(req), route: req.url, method: req.method });
  } else if (result.reason !== "missing") {
    auditAuth("invalid_cookie", {
      ip: getClientIp(req),
      route: req.url,
      method: req.method,
      reason: result.reason,
    });
  }

  return null;
}

export function requireSession(req: NextApiRequest): SessionPayload | null {
  const session = getSessionFromRequest(req);
  if (!session) {
    auditAuth("unauthorized_api_attempt", {
      ip: getClientIp(req),
      route: req.url,
      method: req.method,
    });
  }
  return session;
}
