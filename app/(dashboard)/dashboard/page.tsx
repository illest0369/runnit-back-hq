// LEGACY — not used in active ingest pipeline
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { dedupeQueueJobs } from '@/lib/publish-shared'
import { isProductionBuild } from '@/lib/runtime'
import QueueClient from './QueueClient'

export default async function DashboardPage() {
  if (isProductionBuild()) {
    return <QueueClient initialJobs={[]} channelId="" />
  }

  const { hasSupabaseEnv, supabaseAdmin } = await import('@/lib/supabase')

  if (!hasSupabaseEnv) {
    return <QueueClient initialJobs={[]} channelId="" />
  }

  const session = await getSession()
  if (!session) redirect('/login')

  if (!session.channelIds.length) {
    return (
      <div className="flex items-center justify-center h-[50vh] px-6 text-center">
        <p className="font-headline text-sm text-on-surface-variant uppercase tracking-[0.1em]">
          No channels assigned to your account.
        </p>
      </div>
    )
  }

  // Fetch pending clips from all assigned channels, then collapse duplicates before render.
  const { data: jobs } = await supabaseAdmin
    .from('queue_jobs')
    .select('*')
    .in('channel_id', session.channelIds)
    .in('status', ['pending', 'ready'])
    .order('score', { ascending: false })

  const unique = dedupeQueueJobs(jobs ?? [])

  // Use first channel for refresh/review actions (primary channel)
  const primaryChannelId = session.channelIds[0]

  return <QueueClient initialJobs={unique} channelId={primaryChannelId} />
}
