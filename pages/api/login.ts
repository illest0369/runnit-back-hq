import type { NextApiRequest, NextApiResponse } from "next";
import { supabase, HANDLE_TO_CHANNEL } from "@/lib/supabase";
import { encodeSession, SESSION_COOKIE } from "@/lib/session";

// Server-side passwords stay hardcoded; Supabase is used for user_id + channel_id lookup
const SERVER_PASSWORDS: Record<string, string> = {
  manny: "sports123",
  matt:  "arena123",
  maly:  "women123",
  agent: "combat123",
};

// Fallback channel map if Supabase lookup fails
const FALLBACK_CHANNELS: Record<string, string> = {
  manny: "sports",
  matt:  "arena",
  maly:  "women",
  agent: "combat",
};

type LoginBody = { username?: string; password?: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body ?? {}) as LoginBody;
  const username = body.username?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!username || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  const expectedPwd = SERVER_PASSWORDS[username];
  if (!expectedPwd || expectedPwd !== password) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  // Look up user + primary channel from Supabase
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .single();

  let channel = FALLBACK_CHANNELS[username] ?? "";
  let channel_id: string | null = null;
  let user_id: string | null = user?.id ?? null;

  if (user_id) {
    const { data: uc } = await supabase
      .from("user_channels")
      .select("channel_id, channels(id, handle)")
      .eq("user_id", user_id)
      .limit(1)
      .single();

    // Supabase returns joined rows as an array or object depending on cardinality
    const chRaw = uc?.channels as unknown;
    const ch = Array.isArray(chRaw)
      ? (chRaw[0] as { id: string; handle: string } | undefined)
      : (chRaw as { id: string; handle: string } | null);
    if (ch) {
      channel_id = ch.id;
      channel = HANDLE_TO_CHANNEL[ch.handle] ?? ch.handle;
    }
  }

  const session = encodeSession({ username, channel, user_id, channel_id });
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
  );
  return res.status(200).json({ username, channel });
}
