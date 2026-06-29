'use client'

import { Flame, Info, ThumbsDown, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getCsrfHeaders } from '@/lib/client-csrf'
import {
  isDirectVideoAsset,
  POST_STATUS_LABELS,
  type AppChannel,
  type AppPost,
  type AppRole,
  type AppUserSettings,
} from '@/lib/runnitback'

type QueueScreenProps = {
  channels: AppChannel[]
  initialPosts: AppPost[]
  initialSettings: AppUserSettings
  role: AppRole
}

declare global {
  interface Window {
    runStressTest?: () => void
  }
}

function shortHook(value: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 60) {
    return cleaned
  }

  return `${cleaned.slice(0, 57).trim()}...`
}

function getVideoUrl(post: AppPost) {
  return post.clip_url ?? post.cdn_url ?? post.local_url ?? post.video_url
}

function getPreviewUrl(post: AppPost) {
  return post.preview_url ?? null
}

function confidenceLabel(score: number) {
  if (score >= 85) return 'Likely'
  if (score >= 75) return 'Maybe'
  return 'Weak'
}

function confidenceClass(score: number) {
  if (score >= 85) return 'border-[#00ff88] bg-[#00ff88] text-black'
  if (score >= 75) return 'border-yellow-400 bg-yellow-400 text-black'
  return 'border-white bg-white text-black'
}

export default function QueueScreen({ initialPosts }: QueueScreenProps) {
  const reviewStatuses = useMemo(
    () => new Set(['queued', 'AI_DECISION', 'REVIEWED', 'READY_FOR_CLIP_APPROVAL']),
    [],
  )
  const postStatuses = useMemo(
    () => new Set(['ready_to_post', 'sent_to_publish', 'APPROVED_BY_HUMAN', 'READY_FOR_POST_APPROVAL', 'POST_APPROVED']),
    [],
  )
  const [posts, setPosts] = useState(() =>
    initialPosts.filter((post) => reviewStatuses.has(post.status) || postStatuses.has(post.status)),
  )
  const [isMuted, setIsMuted] = useState(true)
  const [isMetadataOpen, setIsMetadataOpen] = useState(false)
  const [pendingPostId, setPendingPostId] = useState<string | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const postsRef = useRef(posts)

  const publishReadyPosts = posts.filter((post) => postStatuses.has(post.status))
  const reviewPosts = posts.filter((post) => reviewStatuses.has(post.status))
  const currentPost = reviewPosts[0] ?? null
  const nextPost = reviewPosts[1] ?? null
  const currentVideoUrl = currentPost ? getVideoUrl(currentPost) : null
  const nextVideoUrl = nextPost ? getVideoUrl(nextPost) : null
  const currentPreviewUrl = currentPost ? getPreviewUrl(currentPost) : null
  const currentScore = currentPost?.performance_score || currentPost?.score || 0

  const canPlayCurrentVideo = useMemo(
    () => Boolean(currentVideoUrl && isDirectVideoAsset(currentVideoUrl)),
    [currentVideoUrl],
  )
  const canPreloadNextVideo = Boolean(nextVideoUrl && isDirectVideoAsset(nextVideoUrl))

  useEffect(() => {
    setIsMuted(true)
    setIsMetadataOpen(false)
  }, [currentPost?.id])

  useEffect(() => {
    setPosts(
      initialPosts.filter((post) => reviewStatuses.has(post.status) || postStatuses.has(post.status)),
    )
  }, [initialPosts, postStatuses, reviewStatuses])

  useEffect(() => {
    postsRef.current = posts
  }, [posts])

  async function sendDecision(postId: string, action: 'approve' | 'reject') {
    try {
      const csrfHeaders = await getCsrfHeaders()
      const response = await fetch('/api/approval', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders },
        body: JSON.stringify({ post_id: postId, action }),
      })
      const data = await response.json().catch(() => null)
      if (data?.data?.publish_error) {
        console.warn('[publish] approval recorded but publish job failed', data.data.publish_error)
      }
    } catch {
    }
  }

  const decide = useCallback((action: 'approve' | 'reject') => {
    const nextPostToProcess = postsRef.current.find((post) => reviewStatuses.has(post.status))
    if (!nextPostToProcess) {
      return
    }

    const postId = nextPostToProcess.id
    const remainingPosts = postsRef.current.filter((post) => post.id !== postId)
    postsRef.current = remainingPosts
    setPosts(remainingPosts)
    setIsMetadataOpen(false)
    void sendDecision(postId, action)
  }, [reviewStatuses])

  const handleApprove = useCallback(() => {
    decide('approve')
  }, [decide])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      if (event.key.toLowerCase() === 'a' || event.key.toLowerCase() === 'f') {
        event.preventDefault()
        decide('approve')
      } else if (event.key.toLowerCase() === 'r' || event.key.toLowerCase() === 'x') {
        event.preventDefault()
        decide('reject')
      } else if (event.key.toLowerCase() === 'm' || event.key.toLowerCase() === 'i') {
        event.preventDefault()
        setIsMetadataOpen((open) => !open)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [decide])

  function onTouchStart(event: React.TouchEvent) {
    touchStartYRef.current = event.touches[0]?.clientY ?? null
  }

  function onTouchEnd(event: React.TouchEvent) {
    const startY = touchStartYRef.current
    touchStartYRef.current = null
    if (startY === null) {
      return
    }

    const deltaY = startY - (event.changedTouches[0]?.clientY ?? startY)
    if (Math.abs(deltaY) < 80) {
      return
    }

    if (deltaY > 0) {
      decide('approve')
    } else {
      decide('reject')
    }
  }

  async function postAction(postId: string, action: 'send-to-phone' | 'mark-posted') {
    setPendingPostId(postId)
    try {
      const csrfHeaders = await getCsrfHeaders()
      const response = await fetch(`/api/posts/${postId}/${action}`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders },
        body: action === 'send-to-phone'
          ? JSON.stringify({ delivery_target: 'mobile_relay' })
          : JSON.stringify({}),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Post action failed.')
      }

      setPosts((currentPosts) =>
        action === 'mark-posted'
          ? currentPosts.filter((post) => post.id !== postId)
          : currentPosts.map((post) =>
              post.id === postId ? { ...post, status: 'sent_to_publish' } : post,
            ),
      )
    } finally {
      setPendingPostId(null)
    }
  }

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return
    }

    window.runStressTest = function runStressTest() {
      let count = 0
      void getCsrfHeaders().catch(() => null).finally(() => {
        const interval = window.setInterval(() => {
          if (count >= 100) {
            window.clearInterval(interval)
            console.log('Stress test complete')
            return
          }

          handleApprove()
          count += 1
        }, 200)
      })
    }

    return () => {
      delete window.runStressTest
    }
  }, [handleApprove])

  if (publishReadyPosts.length > 0) {
    return (
      <main className="min-h-dvh bg-black px-4 pb-24 pt-5 text-white">
        <section className="mx-auto flex max-w-md flex-col gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
              Distribution
            </p>
            <h1 className="pt-1 text-2xl font-black uppercase tracking-[0.02em]">
              Ready To Post
            </h1>
          </div>

          {publishReadyPosts.map((post) => {
            const videoUrl = getVideoUrl(post)
            const canPlayVideo = Boolean(videoUrl && isDirectVideoAsset(videoUrl))
            const isPending = pendingPostId === post.id

            return (
              <article
                className="overflow-hidden rounded-lg border border-white/12 bg-white/[0.04]"
                key={post.id}
              >
                <div className="aspect-[9/16] max-h-[58dvh] bg-black">
                  {canPlayVideo ? (
                    <video
                      className="h-full w-full object-cover"
                      controls
                      muted
                      playsInline
                      preload="metadata"
                      src={videoUrl ?? undefined}
                    />
                  ) : post.thumbnail_url ? (
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      src={post.thumbnail_url}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-xs font-bold uppercase tracking-[0.12em] text-white/35">
                      Preview unavailable
                    </div>
                  )}
                </div>

                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-white/55">
                      {post.channel.niche}
                    </p>
                    <span className="shrink-0 rounded-full border border-[#00ff88]/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#00ff88]">
                      {POST_STATUS_LABELS[post.status]}
                    </span>
                  </div>

                  <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-white/88">
                    {post.caption || 'Placeholder caption until final hook/caption system is wired.'}
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="h-12 rounded-lg bg-[#00ff88] text-xs font-black uppercase tracking-[0.12em] text-black disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isPending || post.status !== 'ready_to_post'}
                      onClick={() => void postAction(post.id, 'send-to-phone')}
                      type="button"
                    >
                      Send to Phone
                    </button>
                    <button
                      className="h-12 rounded-lg border border-white/20 bg-white/[0.06] text-xs font-black uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isPending}
                      onClick={() => void postAction(post.id, 'mark-posted')}
                      type="button"
                    >
                      Mark Posted
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      </main>
    )
  }

  if (!currentPost) {
    return (
      <main className="fixed inset-0 z-50 flex items-center justify-center bg-black px-6 text-center text-white">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
          NO CLIPS AVAILABLE
        </p>
      </main>
    )
  }

  return (
    <main
      className="fixed inset-0 z-50 bg-black text-white"
      onTouchEnd={onTouchEnd}
      onTouchStart={onTouchStart}
    >
      <section className="relative h-[80dvh] w-full overflow-hidden bg-black">
        {canPlayCurrentVideo ? (
          <video
            autoPlay
            className="h-full w-full object-cover"
            loop
            muted={isMuted}
            onClick={() => setIsMuted((muted) => !muted)}
            playsInline
            preload="auto"
            src={currentVideoUrl ?? undefined}
          />
        ) : currentPreviewUrl ? (
          <iframe
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
            src={currentPreviewUrl}
            title={currentPost.hook}
          />
        ) : currentPost.thumbnail_url ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            src={currentPost.thumbnail_url}
          />
        ) : (
          <div className="h-full w-full bg-black" />
        )}

        <div className="absolute inset-x-0 bottom-0 px-4 pb-5">
          <div className={`mb-3 inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${confidenceClass(currentScore)}`}>
            {confidenceLabel(currentScore)}
          </div>
          <h1 className="max-w-[92%] text-[1.35rem] font-black leading-tight text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.85)]">
            {shortHook(currentPost.hook)}
          </h1>
          <p className="pt-2 text-xs font-medium text-white/60">
            {reviewPosts.length} in queue · {publishReadyPosts.length} ready
          </p>
        </div>

        <div className="absolute right-3 top-4 flex flex-col gap-3">
          <button
            aria-label={isMuted ? 'Unmute clip' : 'Mute clip'}
            className="grid size-11 place-items-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur"
            onClick={() => setIsMuted((muted) => !muted)}
            type="button"
          >
            {isMuted ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          <button
            aria-label="Open clip metadata"
            className="grid size-11 place-items-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur"
            onClick={() => setIsMetadataOpen(true)}
            type="button"
          >
            <Info size={19} />
          </button>
        </div>
      </section>

      {canPreloadNextVideo ? (
        <video className="hidden" muted preload="auto" src={nextVideoUrl ?? undefined} />
      ) : null}

      <section className="fixed inset-x-0 bottom-0 z-10 bg-black px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
        <div className="mx-auto grid max-w-md grid-cols-[7fr_3fr] gap-3">
          <button
            className="inline-flex h-16 items-center justify-center gap-2 rounded-lg bg-[#00ff88] text-base font-black uppercase tracking-[0.12em] text-black active:scale-[0.99]"
            onClick={handleApprove}
            type="button"
          >
            <Flame size={20} fill="currentColor" />
            Flame
          </button>
          <button
            className="inline-flex h-16 items-center justify-center gap-2 rounded-lg border border-white/35 bg-transparent text-sm font-black uppercase tracking-[0.12em] text-white/75 active:scale-[0.99]"
            onClick={() => decide('reject')}
            type="button"
          >
            <ThumbsDown size={18} />
            Reject
          </button>
        </div>
      </section>

      {isMetadataOpen ? (
        <section className="fixed inset-x-0 bottom-0 z-20 rounded-t-lg border-t border-white/15 bg-[#090909] px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 shadow-2xl">
          <div className="mx-auto max-w-md">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                  Clip Intel
                </p>
                <h2 className="pt-1 text-lg font-black leading-tight">{currentPost.title || currentPost.hook}</h2>
              </div>
              <button
                aria-label="Close metadata"
                className="grid size-10 shrink-0 place-items-center rounded-full border border-white/15 text-white/75"
                onClick={() => setIsMetadataOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white/[0.06] p-3">
                <dt className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">Score</dt>
                <dd className="pt-1 text-lg font-black">{Math.round(currentScore)}</dd>
              </div>
              <div className="rounded-lg bg-white/[0.06] p-3">
                <dt className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">Source</dt>
                <dd className="truncate pt-1 text-xs font-bold">{currentPost.channel.niche}</dd>
              </div>
              <div className="rounded-lg bg-white/[0.06] p-3">
                <dt className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">Status</dt>
                <dd className="truncate pt-1 text-xs font-bold">{POST_STATUS_LABELS[currentPost.status]}</dd>
              </div>
            </dl>

            {currentPost.viral_reasoning?.length ? (
              <ul className="mt-4 space-y-2 text-sm font-medium text-white/72">
                {currentPost.viral_reasoning.slice(0, 3).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}

            {currentPost.risk_notes?.length ? (
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-red-300">
                Risk: {currentPost.risk_notes.join(', ')}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  )
}
