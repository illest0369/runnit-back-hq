import type { NextApiRequest, NextApiResponse } from "next";

const SESSION_COOKIE = "rb_session";
const USERS: Record<string, { password: string; channel: string }> = {
  manny: { password: "sports123", channel: "sports" },
  matt:  { password: "arena123",  channel: "arena"  },
  maly:  { password: "women123",  channel: "women"  },
  agent: { password: "combat123", channel: "combat" },
};

type SessionPayload = { username: string; channel: string };

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
    if (!parsed.username || !parsed.channel) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parseCookies(req.headers.cookie);
  const session = decodeSession(cookies[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  // Validate channel still matches user config
  const user = USERS[session.username];
  if (!user || user.channel !== session.channel) {
    return res.status(401).json({ error: "Invalid session" });
  }

  return res.status(200).json({ username: session.username, channel: session.channel });
}
