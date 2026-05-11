import crypto from "node:crypto";
import fs from "node:fs";

const baseUrl = (process.env.RBHQ_TEST_URL ?? "http://localhost:3000").replace(/\/$/, "");
const env = loadLocalEnv();
const appPin = process.env.APP_PIN ?? env.APP_PIN;
const ownerUsername = process.env.OWNER_USERNAME ?? env.OWNER_USERNAME ?? "owner";
const sessionSecret = process.env.SESSION_SECRET ?? env.SESSION_SECRET;

const checks = [];

function loadLocalEnv() {
  try {
    return Object.fromEntries(
      fs.readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"))
        .map(line => {
          const [key, ...rest] = line.split("=");
          return [key, rest.join("=")];
        })
    );
  } catch {
    return {};
  }
}

function assertCheck(name, pass, detail) {
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
}

function cookieFrom(headers) {
  const raw = headers.get("set-cookie") ?? "";
  return raw.split(";")[0];
}

function signedCookie(payload) {
  if (!sessionSecret || sessionSecret.length < 16) {
    throw new Error("SESSION_SECRET is required to generate test cookies");
  }

  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", sessionSecret).update(body).digest("base64url");
  return `rb_session=${body}.${sig}`;
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, { redirect: "manual", ...options });
}

async function main() {
  assertCheck("APP_PIN available", Boolean(appPin), "APP_PIN is missing for smoke login");

  let res = await request("/login");
  assertCheck("/login loads", res.status === 200, `expected 200, got ${res.status}`);

  res = await request("/");
  assertCheck("/ redirects to /login", res.status === 307 && res.headers.get("location") === "/login", `got ${res.status} ${res.headers.get("location")}`);

  res = await request("/dashboard");
  assertCheck("/dashboard redirects logged out", res.status === 307 && (res.headers.get("location") ?? "").startsWith("/login"), `got ${res.status} ${res.headers.get("location")}`);

  res = await request("/api/session");
  assertCheck("unauth /api/session returns 401", res.status === 401, `got ${res.status}`);

  res = await request("/api/clips");
  assertCheck("unauth /api/clips returns 401", res.status === 401, `got ${res.status}`);

  res = await request("/api/approval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: "security_smoke", action: "approve" }),
  });
  assertCheck("unauth /api/approval returns 401", res.status === 401, `got ${res.status}`);

  res = await request("/api/process-clip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertCheck("unauth /api/process-clip returns 401", res.status === 401, `got ${res.status}`);

  res = await request("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: appPin }),
  });
  assertCheck("valid login returns 200", res.status === 200, `got ${res.status}`);
  const sessionCookie = cookieFrom(res.headers);
  assertCheck("valid login sets rb_session", sessionCookie.startsWith("rb_session=") && sessionCookie.includes("."), "missing signed cookie");

  res = await request("/dashboard", { headers: { Cookie: sessionCookie } });
  assertCheck("valid session reaches /dashboard", res.status === 200, `got ${res.status}`);

  const tampered = sessionCookie.replace(/[A-Za-z0-9_-]$/, char => (char === "A" ? "B" : "A"));
  res = await request("/dashboard", { headers: { Cookie: tampered } });
  assertCheck("tampered cookie redirects", res.status === 307 && (res.headers.get("location") ?? "").startsWith("/login"), `got ${res.status} ${res.headers.get("location")}`);

  const now = Date.now();
  const expired = signedCookie({
    username: ownerUsername,
    channel: "operator",
    iat: now - 10 * 60 * 60 * 1000,
    exp: now - 1000,
  });
  res = await request("/dashboard", { headers: { Cookie: expired } });
  assertCheck("expired cookie redirects", res.status === 307 && (res.headers.get("location") ?? "").startsWith("/login"), `got ${res.status} ${res.headers.get("location")}`);

  res = await request("/api/session", { headers: { Cookie: expired } });
  assertCheck("expired API session returns 401", res.status === 401, `got ${res.status}`);

  console.table(checks);
}

main().catch(err => {
  console.error(err.message);
  console.table(checks);
  process.exit(1);
});
