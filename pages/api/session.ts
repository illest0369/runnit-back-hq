import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = requireSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  const operatorUsername = process.env.OPERATOR_USERNAME ?? process.env.OWNER_USERNAME;
  if (operatorUsername && session.username !== operatorUsername) {
    return res.status(401).json({ error: "Invalid session" });
  }

  return res.status(200).json({ username: session.username, channel: session.channel, expiresAt: session.exp });
}
