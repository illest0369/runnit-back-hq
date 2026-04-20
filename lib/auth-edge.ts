/**
 * Edge-safe subset of auth — no Node.js built-ins.
 * Used only by middleware.ts which runs in the Edge runtime.
 */

export const SESSION_COOKIE = "rb_session";

export type SessionPayload = {
  username: string;
  channel: string;
};

export function decodeSessionEdge(value?: string): SessionPayload | null {
  if (!value) return null;
  try {
    const json = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(json) as SessionPayload;
    if (!parsed.username || !parsed.channel) return null;
    return parsed;
  } catch {
    return null;
  }
}
