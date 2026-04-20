import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionFromRequest, readUsers } from "@/lib/auth";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = getSessionFromRequest(req);

  if (!session) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const users = readUsers();
  const user = users[session.username];

  if (!user || user.channel !== session.channel) {
    return res.status(401).json({ error: "Invalid session" });
  }

  return res.status(200).json({
    username: session.username,
    channel: session.channel
  });
}
