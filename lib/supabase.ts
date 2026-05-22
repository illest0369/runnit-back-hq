import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Channel handle → short name used throughout the app
export const HANDLE_TO_CHANNEL: Record<string, string> = {
  runnitbacksports: "sports",
  runnitbackarena:  "arena",
  runnitbackwomen:  "women",
  runnitbackcombat: "combat",
  runnitbackcfb:    "cfb",
};

export const CHANNEL_TO_HANDLE: Record<string, string> = Object.fromEntries(
  Object.entries(HANDLE_TO_CHANNEL).map(([h, c]) => [c, h])
);
