// LEGACY — not used in active ingest pipeline
import { redirect } from 'next/navigation'

import { getSession } from '@/lib/auth'
import { DESTINATION_LABELS, POST_STATUS_LABELS, type PublishPostRecord } from '@/lib/publish-shared'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { isProductionBuild } from '@/lib/runtime'

type QueueJobSummary = {
  id: string
  post_package?: {
    title?: string
    channelTitle?: string
  } | null
}

export default async function HistoryPage() {
  if (isProductionBuild()) {
    return (
      <div className="p-3 pb-20">
        <div className="mb-6">
          <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.12em] mb-1">ARCHIVE</p>
          <h1 className="font-headline font-black text-[28px] text-on-surface tracking-tight leading-none mb-1">HISTORY</h1>
          <p className="font-headline font-bold text-[11px] text-on-surface-variant uppercase tracking-[0.08em]">0 POSTS</p>
        </div>
        <div className="border-2 border-dashed border-outline-variant rounded-xl py-16 px-6 text-center">
          <p className="font-headline font-bold text-sm text-on-surface-variant uppercase tracking-[0.06em] mb-1">BUILD MODE</p>
          <p className="font-mono text-xs text-outline-variant uppercase tracking-[0.06em]">LIVE HISTORY LOADS AT RUNTIME</p>
        </div>
      </div>
    )
  }

  const { hasSupabaseEnv, supabaseAdmin } = await import('@/lib/supabase')

  if (!hasSupabaseEnv) {
    return (
      <div className="p-3 pb-20">
        <div className="mb-6">
          <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.12em] mb-1">ARCHIVE</p>
          <h1 className="font-headline font-black text-[28px] text-on-surface tracking-tight leading-none mb-1">HISTORY</h1>
          <p className="font-headline font-bold text-[11px] text-on-surface-variant uppercase tracking-[0.08em]">0 POSTS</p>
        </div>
        <div className="border-2 border-dashed border-outline-variant rounded-xl py-16 px-6 text-center">
          <p className="font-headline font-bold text-sm text-on-surface-variant uppercase tracking-[0.06em] mb-1">BUILD MODE</p>
          <p className="font-mono text-xs text-outline-variant uppercase tracking-[0.06em]">LIVE HISTORY LOADS AT RUNTIME</p>
        </div>
      </div>
    )
  }

  const session = await getSession()
  if (!session) redirect('/login')

  const { data: queueJobs } = await supabaseAdmin
    .from('queue_jobs')
    .select('id, post_package')
    .in('channel_id', session.channelIds)
    .order('created_at', { ascending: false })
    .limit(200)

  const jobMap = new Map(
    ((queueJobs ?? []) as QueueJobSummary[]).map((job) => [job.id, job]),
  )
  const clipIds = (queueJobs ?? []).map((job) => job.id)

  let posts: PublishPostRecord[] = []

  if (clipIds.length > 0) {
    const { data: postsData } = await supabaseAdmin
      .from('posts')
      .select('*')
      .in('clip_id', clipIds)
      .order('created_at', { ascending: false })
      .limit(50)

    posts = (postsData ?? []) as PublishPostRecord[]
  }

  if (posts.length === 0) {
    const { data: postsData } = await supabaseAdmin
      .from('post_log')
      .select('*')
      .in('channel_id', session.channelIds)
      .order('posted_at', { ascending: false })
      .limit(50)

    const legacyPosts = postsData ?? []

    return (
      <div className="p-3 pb-20">
        <div className="mb-6">
          <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.12em] mb-1">ARCHIVE</p>
          <h1 className="font-headline font-black text-[28px] text-on-surface tracking-tight leading-none mb-1">HISTORY</h1>
          <p className="font-headline font-bold text-[11px] text-on-surface-variant uppercase tracking-[0.08em]">{legacyPosts.length} POSTS</p>
        </div>

        {legacyPosts.length === 0 ? (
          <div className="border-2 border-dashed border-outline-variant rounded-xl py-16 px-6 text-center">
            <p className="font-headline font-bold text-sm text-on-surface-variant uppercase tracking-[0.06em] mb-1">NO POSTS YET</p>
            <p className="font-mono text-xs text-outline-variant uppercase tracking-[0.06em]">POSTS APPEAR AFTER PUBLISHING TO TIKTOK</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {legacyPosts.map(post => (
              <div key={post.id} className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-4">
                <p className="font-mono text-[10px] font-bold text-outline-variant uppercase tracking-[0.06em] mb-2.5">
                  {new Date(post.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                  {' · '}
                  {new Date(post.posted_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </p>
                {post.caption && (
                  <p className="text-on-surface text-sm leading-relaxed mb-2 line-clamp-3">{post.caption}</p>
                )}
                {post.hook && (
                  <p className="text-on-surface-variant text-xs italic mb-3">"{post.hook}"</p>
                )}
                <div className="flex gap-2">
                  {post.clip_url && (
                    <a
                      href={post.clip_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] font-bold text-on-surface-variant bg-background border border-outline-variant/40 px-3 py-1.5 rounded-md no-underline hover:text-primary transition-colors"
                    >
                      CLIP ↗
                    </a>
                  )}
                  {post.tiktok_post_id && (
                    <a
                      href={`https://www.tiktok.com/@runnitback/video/${post.tiktok_post_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/25 px-3 py-1.5 rounded-md no-underline"
                    >
                      TIKTOK ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-3 pb-20">
      <div className="mb-6">
        <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.12em] mb-1">ARCHIVE</p>
        <h1 className="font-headline font-black text-[28px] text-on-surface tracking-tight leading-none mb-1">HISTORY</h1>
        <p className="font-headline font-bold text-[11px] text-on-surface-variant uppercase tracking-[0.08em]">{posts.length} POSTS</p>
      </div>

      <div className="flex flex-col gap-3">
        {posts.map((post) => {
          const job = jobMap.get(post.clip_id)
          const title = job?.post_package?.title || `Clip ${post.clip_id.slice(0, 6)}`
          const channelTitle = job?.post_package?.channelTitle || 'Runnit Back'
          const timestamp = post.scheduled_time || post.created_at

          return (
            <div key={post.id} className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <p className="font-mono text-[10px] font-bold text-outline-variant uppercase tracking-[0.06em]">
                  {new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                  {' · '}
                  {new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <div className="flex gap-2">
                  <span className="font-headline font-black text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded-full bg-background/70 text-on-surface">
                    {POST_STATUS_LABELS[post.status]}
                  </span>
                  <span className="font-headline font-black text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded-full bg-background/70 text-on-surface-variant">
                    {DESTINATION_LABELS[post.destination]}
                  </span>
                </div>
              </div>

              <h2 className="font-headline font-black text-sm text-on-surface uppercase tracking-[0.02em] mb-1">
                {title}
              </h2>
              <p className="text-[11px] text-on-surface-variant uppercase tracking-[0.08em] mb-3">
                {channelTitle}
              </p>

              {post.caption ? (
                <p className="text-on-surface text-sm leading-relaxed mb-3 whitespace-pre-wrap">
                  {post.caption}
                </p>
              ) : null}

              <div className="flex gap-2">
                <a
                  href={post.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] font-bold text-on-surface-variant bg-background border border-outline-variant/40 px-3 py-1.5 rounded-md no-underline hover:text-primary transition-colors"
                >
                  VIDEO ↗
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
