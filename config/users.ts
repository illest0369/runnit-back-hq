import type { UserRecord } from "@/lib/auth";

/**
 * Static user config — bundled at build time so it's always available
 * in serverless functions without filesystem access.
 *
 * To add a user: add an entry here and redeploy.
 */
export const USERS: Record<string, UserRecord> = {
  manny: { password: "sports123", channel: "sports" },
  matt:  { password: "arena123",  channel: "arena"  },
  maly:  { password: "women123",  channel: "women"  },
  agent: { password: "combat123", channel: "combat" },
};
