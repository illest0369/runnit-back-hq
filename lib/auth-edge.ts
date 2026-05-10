/**
 * Edge-safe subset of auth — no Node.js built-ins.
 * Used only by middleware.ts which runs in the Edge runtime.
 */

export const SESSION_COOKIE = "rb_session";
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

export type SessionPayload = {
  username: string;
  channel: string;
  iat: number;
};

export function decodeSessionEdge(value?: string): SessionPayload | null {
  if (!value) return null;
  try {
    const json = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(json) as SessionPayload;
    if (!parsed.username || !parsed.channel || !parsed.iat) return null;
    if (Date.now() - parsed.iat > SESSION_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
