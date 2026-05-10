import type { NextApiRequest, NextApiResponse } from "next";

const SESSION_COOKIE = "rb_session";
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

type SessionPayload = { username: string; channel: string; iat: number };

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) acc[k.trim()] = v.join("=");
    return acc;
  }, {});
}

function decodeSession(value?: string): SessionPayload | null {
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

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parseCookies(req.headers.cookie);
  const session = decodeSession(cookies[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  const ownerUsername = process.env.OWNER_USERNAME;
  if (ownerUsername && session.username !== ownerUsername) {
    return res.status(401).json({ error: "Invalid session" });
  }

  return res.status(200).json({ username: session.username, channel: session.channel });
}
