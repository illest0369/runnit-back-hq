import type { NextApiRequest, NextApiResponse } from "next";

// Inline session encoding — no fs or path needed
const SESSION_COOKIE = "rb_session";

const USERS: Record<string, { password: string; channel: string }> = {
  manny: { password: "sports123", channel: "sports" },
  matt:  { password: "arena123",  channel: "arena"  },
  maly:  { password: "women123",  channel: "women"  },
  agent: { password: "combat123", channel: "combat" },
};

function encodeSession(payload: { username: string; channel: string }): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

type LoginBody = { username?: string; password?: string };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (req.body ?? {}) as LoginBody;
    const username = body.username?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!username || !password) {
      return res.status(400).json({ error: "Missing credentials" });
    }

    const user = USERS[username];
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const session = encodeSession({ username, channel: user.channel });
    const cookie = `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
    res.setHeader("Set-Cookie", cookie);
    return res.status(200).json({ username, channel: user.channel });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "server_error", detail: msg });
  }
}
