import type { ApprovalWebhookPayload } from './clip-db'

export type ApprovalWebhookDelivery = {
  status: 'sent' | 'not_configured' | 'failed'
  deliveredAt: string | null
  error?: string
}

export async function sendApprovalWebhook(
  payload: ApprovalWebhookPayload,
): Promise<ApprovalWebhookDelivery> {
  const webhookUrl = process.env.APPROVAL_WEBHOOK_URL?.trim()

  if (!webhookUrl) {
    return {
      status: 'not_configured',
      deliveredAt: null,
    }
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      return {
        status: 'failed',
        deliveredAt: null,
        error: `Webhook returned ${response.status}.`,
      }
    }

    return {
      status: 'sent',
      deliveredAt: new Date().toISOString(),
    }
  } catch (error) {
    return {
      status: 'failed',
      deliveredAt: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
