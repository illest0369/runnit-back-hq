import type { NextApiRequest } from "next";

export type SessionPayload = {
  username: string;
  channel: string;
  iat: number;
};

const SESSION_COOKIE = "rb_session";
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function encodeSession(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeSession(value?: string): SessionPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed.username || !parsed.channel || !parsed.iat) return null;
    if (Date.now() - parsed.iat > SESSION_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
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
  return decodeSession(cookies[SESSION_COOKIE]);
}
