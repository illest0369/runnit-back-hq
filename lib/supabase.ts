import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseConfigStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing: string[] = [];

  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return { configured: missing.length === 0, missing, url, anonKey };
}

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const config = getSupabaseConfigStatus();
  if (!config.configured || !config.url || !config.anonKey) {
    throw new Error(`Supabase is not configured: missing ${config.missing.join(", ")}`);
  }

  cachedClient = createClient(config.url, config.anonKey);
  return cachedClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = client[prop as keyof SupabaseClient];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

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
