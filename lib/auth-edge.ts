/**
 * Edge-safe subset of auth — no Node.js built-ins.
 * Used only by middleware.ts which runs in the Edge runtime.
 */

export const SESSION_COOKIE = "rb_session";

export type SessionPayload = {
  username: string;
  channel: string;
  iat: number;
  exp: number;
};

export type EdgeSessionDecodeResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; reason: "missing" | "malformed" | "invalid_signature" | "expired" | "secret_missing" };

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const chars = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(chars).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(sig);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function decodeSessionEdgeDetailed(value?: string): Promise<EdgeSessionDecodeResult> {
  if (!value) return { ok: false, reason: "missing" };
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 16) return { ok: false, reason: "secret_missing" };

  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }

  const [body, signature] = parts;
  const expected = await signPayload(body, secret);
  if (!safeEqual(signature, expected)) {
    return { ok: false, reason: "invalid_signature" };
  }

  try {
    const json = new TextDecoder().decode(base64UrlToBytes(body));
    const parsed = JSON.parse(json) as SessionPayload;
    if (!parsed.username || !parsed.channel || !parsed.iat || !parsed.exp) {
      return { ok: false, reason: "malformed" };
    }
    if (Date.now() > parsed.exp) return { ok: false, reason: "expired" };
    return { ok: true, session: parsed };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
