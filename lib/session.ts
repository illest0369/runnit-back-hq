import type { NextApiRequest } from "next";

export type SessionPayload = {
  username: string;
  channel: string;
  user_id?: string | null;
  channel_id?: string | null;
};

const SESSION_COOKIE = "rb_session";

export function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) acc[k.trim()] = v.join("=");
    return acc;
  }, {});
}

export function decodeSession(value?: string): SessionPayload | null {
  if (!value) return null;
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as SessionPayload;
    if (!parsed.username || !parsed.channel) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function encodeSession(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function getSession(req: NextApiRequest): SessionPayload | null {
  const cookies = parseCookies(req.headers.cookie);
  return decodeSession(cookies[SESSION_COOKIE]);
}

export { SESSION_COOKIE };
