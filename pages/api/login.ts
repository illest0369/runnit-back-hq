import type { NextApiRequest, NextApiResponse } from "next";
import { encodeSession, getSessionCookieName } from "@/lib/auth";
import { USERS } from "@/config/users";

type LoginBody = {
  username?: string;
  password?: string;
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body ?? {}) as LoginBody;
  const username = body.username?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!username || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  const user = USERS[username];

  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const session = encodeSession({ username, channel: user.channel });
  const cookie = [
    `${getSessionCookieName()}=${session}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=86400"
  ].join("; ");

  res.setHeader("Set-Cookie", cookie);
  return res.status(200).json({ username, channel: user.channel });
}
