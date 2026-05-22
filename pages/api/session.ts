import type { NextApiRequest, NextApiResponse } from "next";
import { getSession } from "@/lib/session";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  return res.status(200).json({
    username: session.username,
    channel: session.channel,
  });
}
