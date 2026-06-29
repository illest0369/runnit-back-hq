import { supabaseAdminClient } from '../supabase-admin'

export async function recordTikTokAnalyticsSnapshot(input: {
  postId: string
  views: number
  likes: number
  comments: number
  shares: number
  retention?: number | null
  rawPayload?: Record<string, unknown>
}) {
  const { error } = await supabaseAdminClient.from('rbhq_analytics_snapshots').insert({
    post_id: input.postId,
    views: input.views,
    likes: input.likes,
    comments: input.comments,
    shares: input.shares,
    retention: input.retention ?? null,
    raw_payload: input.rawPayload ?? {},
  })

  if (error) {
    throw new Error(error.message)
  }
}
