import type { NextApiRequest } from "next";

type AuditEvent =
  | "login_success"
  | "login_failure"
  | "invalid_cookie"
  | "expired_session"
  | "unauthorized_api_attempt";

type AuditFields = {
  ip?: string;
  route?: string;
  method?: string;
  username?: string;
  reason?: string;
};

export function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

export function auditAuth(event: AuditEvent, fields: AuditFields = {}) {
  const payload = {
    event,
    at: new Date().toISOString(),
    ...fields,
  };

  console.info("RBHQ_AUTH_AUDIT", JSON.stringify(payload));
}
