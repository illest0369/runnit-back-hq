import type { NextApiRequest, NextApiResponse } from "next";

// Set N8N_WEBHOOK_URL in Vercel env vars for production n8n integration
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL ?? "http://127.0.0.1:5678/webhook/approval";
const SAFE_POST_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

type ApprovalRequestBody = {
  post_id?: string;
  action?: "approve" | "reject";
};

function isValidAction(action: string): action is "approve" | "reject" {
  return action === "approve" || action === "reject";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (req.body ?? {}) as ApprovalRequestBody;
    const { post_id, action } = body;

    if (!post_id || !action) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (
      typeof post_id !== "string" ||
      !SAFE_POST_ID_RE.test(post_id) ||
      !isValidAction(action)
    ) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const webhookResponse = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ post_id, action })
    });

    if (!webhookResponse.ok) {
      return res.status(500).json({ error: "n8n failed" });
    }

    return res.status(200).json({ success: true });
  } catch {
    return res.status(400).json({ error: "Invalid request" });
  }
}
