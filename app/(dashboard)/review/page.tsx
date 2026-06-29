'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  buildPreviewVideoUrl,
  dedupeQueueJobs,
  fromDatetimeLocalValue,
  isDirectVideoAsset,
  POST_STATUS_LABELS,
  resolvePublishDestination,
  toDatetimeLocalValue,
  type PublishPostRecord,
  type QueueJobPreview,
  type SocialAccountRecord,
} from '@/lib/publish-shared'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://clip-worker-production-6e2f.up.railway.app'
const CAPTION_PLATFORM = 'tiktok'

interface Job extends QueueJobPreview {
  post_package: {
    title: string
    thumbnail: string
    channelTitle: string
    url: string
    viewCount?: number
    velocity?: number
  }
}

interface Caption {
  clipIndex: number
  platform: string
  caption: string
  hashtags: string[]
}

type PublishContextResponse = {
  account: SocialAccountRecord | null
  posts: PublishPostRecord[]
}

type PublishPostResponse = {
  post?: PublishPostRecord
  account?: SocialAccountRecord | null
  message?: string
  error?: string
}

function mergeCaptionAndHashtags(caption: Caption): string {
  const hashtags = caption.hashtags
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .join(' ')

  return [caption.caption.trim(), hashtags.trim()].filter(Boolean).join('\n\n')
}

function routeHint(destination: PublishPostRecord['destination'] | ReturnType<typeof resolvePublishDestination>): string {
  if (destination === 'manual') {
    return 'Approved clips move into the Metricool export queue after render completes.'
  }

  return 'Legacy direct and Buffer routes are disabled. Use the Metricool export queue.'
}

export default function ReviewPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [channelId, setChannelId] = useState('')
  const [step, setStep] = useState<'approval' | 'publish'>('approval')
  const [approved, setApproved] = useState<Record<string, boolean | null>>({})
  const [captions, setCaptions] = useState<Caption[]>([])
  const [generating, setGenerating] = useState(false)
  const [socialAccount, setSocialAccount] = useState<SocialAccountRecord | null>(null)
  const [postsByClipId, setPostsByClipId] = useState<Record<string, PublishPostRecord>>({})
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({})
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({})
  const [publishingByClipId, setPublishingByClipId] = useState<Record<string, boolean>>({})
  const [publishFeedbackByClipId, setPublishFeedbackByClipId] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('rb_selected')
    const storedChannelId = sessionStorage.getItem('rb_channel_id')

    if (!stored) {
      router.push('/dashboard')
      return
    }

    const parsed = dedupeQueueJobs(JSON.parse(stored) as Job[]) as Job[]
    const initialApproval: Record<string, boolean | null> = {}

    parsed.forEach((job) => {
      initialApproval[job.id] = null
    })

    setJobs(parsed)
    setChannelId(storedChannelId || '')
    setApproved(initialApproval)
  }, [router])

  useEffect(() => {
    if (!channelId || jobs.length === 0) {
      return
    }

    void hydratePublishContext(jobs, channelId)
  }, [jobs, channelId])

  const approvedJobs = useMemo(
    () => jobs.filter((job) => approved[job.id] === true),
    [approved, jobs],
  )
  const approvedCount = approvedJobs.length
  const rejectedCount = jobs.filter((job) => approved[job.id] === false).length
  const defaultDestination = resolvePublishDestination(socialAccount)

  async function hydratePublishContext(nextJobs: Job[], nextChannelId: string) {
    const response = await fetch('/api/publish/context', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: nextChannelId,
        jobs: nextJobs,
      }),
    })

    if (!response.ok) {
      return
    }

    const data = (await response.json()) as PublishContextResponse
    const posts = data.posts ?? []
    const nextPostsByClipId = Object.fromEntries(posts.map((post) => [post.clip_id, post]))

    setSocialAccount(data.account ?? null)
    setPostsByClipId(nextPostsByClipId)
    setCaptionDrafts((current) => {
      const next = { ...current }

      nextJobs.forEach((job) => {
        if (!next[job.id]?.trim()) {
          next[job.id] = nextPostsByClipId[job.id]?.caption ?? ''
        }
      })

      return next
    })
    setScheduleDrafts((current) => {
      const next = { ...current }

      nextJobs.forEach((job) => {
        if (!next[job.id]) {
          next[job.id] = toDatetimeLocalValue(nextPostsByClipId[job.id]?.scheduled_time)
        }
      })

      return next
    })
  }

  function toggleApproval(id: string, value: boolean) {
    setApproved((current) => ({
      ...current,
      [id]: current[id] === value ? null : value,
    }))
  }

  function handleApproveAll() {
    setApproved(Object.fromEntries(jobs.map((job) => [job.id, true])))
  }

  function handleRejectAll() {
    setApproved(Object.fromEntries(jobs.map((job) => [job.id, false])))
  }

  async function handleGenerateCaptions() {
    if (!approvedJobs.length) {
      return
    }

    setGenerating(true)

    try {
      const clips = approvedJobs.map((job) => ({
        title: job.post_package.title,
        channelTitle: job.post_package.channelTitle,
        platforms: [CAPTION_PLATFORM],
      }))

      const res = await fetch(`${API}/api/captions`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips, channelId }),
      })
      const data = await res.json()
      const nextCaptions = (data.captions ?? []) as Caption[]

      setCaptions(nextCaptions)
      setCaptionDrafts((current) => {
        const next = { ...current }

        approvedJobs.forEach((job, index) => {
          const match = nextCaptions.find(
            (caption) =>
              caption.clipIndex === index && caption.platform === CAPTION_PLATFORM,
          )

          if (match) {
            next[job.id] = mergeCaptionAndHashtags(match)
          }
        })

        return next
      })
    } catch (error) {
      console.error(error)
    } finally {
      setGenerating(false)
    }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handlePublish(job: Job) {
    const post = postsByClipId[job.id]

    if (!post) {
      setPublishFeedbackByClipId((current) => ({
        ...current,
        [job.id]: 'Publish state is still loading for this clip.',
      }))
      return
    }

    const caption = captionDrafts[job.id]?.trim()

    if (!caption) {
      setPublishFeedbackByClipId((current) => ({
        ...current,
        [job.id]: 'Add a caption before publishing.',
      }))
      return
    }

    const scheduledTime = fromDatetimeLocalValue(scheduleDrafts[job.id] ?? '')
    const videoUrl = buildPreviewVideoUrl(job)

    setPublishingByClipId((current) => ({ ...current, [job.id]: true }))
    setPublishFeedbackByClipId((current) => ({ ...current, [job.id]: '' }))
    setPostsByClipId((current) => ({
      ...current,
      [job.id]: {
        ...post,
        caption,
        scheduled_time: scheduledTime,
        video_url: videoUrl || post.video_url,
        status: 'publishing',
      },
    }))

    try {
      const response = await fetch('/api/publishPost', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          caption,
          videoUrl,
          scheduledTime,
        }),
      })

      const data = (await response.json()) as PublishPostResponse

      if (!response.ok || !data.post) {
        throw new Error(data.error || 'Publish failed.')
      }

      const returnedPost = data.post

      setPostsByClipId((current) => ({
        ...current,
        [job.id]: returnedPost,
      }))

      if (data.account) {
        setSocialAccount(data.account)
      }

      setPublishFeedbackByClipId((current) => ({
        ...current,
        [job.id]:
          data.message ||
          (returnedPost.status === 'queued'
            ? 'Post scheduled successfully.'
            : 'Post published successfully.'),
      }))
    } catch (error) {
      setPostsByClipId((current) => ({
        ...current,
        [job.id]: {
          ...current[job.id],
          status: 'failed',
        },
      }))
      setPublishFeedbackByClipId((current) => ({
        ...current,
        [job.id]:
          error instanceof Error ? error.message : 'Publish failed for this clip.',
      }))
    } finally {
      setPublishingByClipId((current) => ({ ...current, [job.id]: false }))
    }
  }

  if (!jobs.length) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-on-surface-variant font-headline text-xs tracking-[0.1em]">
        LOADING...
      </div>
    )
  }

  if (step === 'approval') {
    return (
      <div>
        <div className="sticky top-14 z-30 bg-background border-b border-outline-variant/20 px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-xl text-primary-container">analytics</span>
            <span className="font-headline font-black text-base uppercase tracking-tight text-primary">APPROVAL BOARD</span>
          </div>
          <span className="bg-primary-container text-on-primary font-headline font-black text-[10px] uppercase tracking-[0.08em] px-2.5 py-1 rounded-[3px]">
            {jobs.length} SELECTED
          </span>
        </div>

        <p className="font-headline font-black text-[10px] text-on-surface-variant/60 uppercase tracking-[0.16em] px-4 py-2">
          Review and approve selected clips
        </p>

        <div className="px-3 flex flex-col gap-1">
          {jobs.map((job) => {
            const state = approved[job.id]

            return (
              <div
                key={job.id}
                className={[
                  'flex items-center gap-2.5 px-2 py-1.5 rounded transition-colors relative overflow-hidden',
                  state === true ? 'bg-primary-container/5 border-l-[3px] border-primary-container' : '',
                  state === false ? 'opacity-50 border-l-[3px] border-error bg-surface-container-low' : '',
                  state === null ? 'bg-surface-container-low border-l-[3px] border-transparent' : '',
                ].join(' ')}
              >
                <div className="w-10 h-14 flex-shrink-0 rounded-[3px] overflow-hidden bg-surface-container-highest">
                  {job.post_package.thumbnail
                    ? (
                        <img
                          src={job.post_package.thumbnail}
                          className="w-full h-full object-cover"
                          style={{
                            filter:
                              state === null
                                ? 'grayscale(100%)'
                                : state === false
                                  ? 'grayscale(100%)'
                                  : 'none',
                            transition: 'filter 0.2s',
                          }}
                          alt=""
                        />
                      )
                    : <div className="w-full h-full bg-surface-container-highest" />}
                </div>

                <div className="flex-1 min-w-0">
                  <h3
                    className={[
                      'text-[11px] font-headline font-bold uppercase tracking-[0.01em] truncate',
                      state === true ? 'text-primary' : 'text-on-surface',
                    ].join(' ')}
                  >
                    {job.post_package.title}
                  </h3>
                  <div
                    className={[
                      'inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded-[3px] text-[9px] font-headline font-black italic uppercase tracking-[0.06em]',
                      state === true
                        ? 'bg-primary-container text-on-primary'
                        : 'bg-surface-container-highest text-on-surface-variant',
                    ].join(' ')}
                  >
                    REVIEW
                  </div>
                </div>

                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => toggleApproval(job.id, true)}
                    className={[
                      'w-9 h-9 flex items-center justify-center rounded transition-all',
                      state === true
                        ? 'bg-primary-container text-on-primary shadow-[0_0_8px_rgba(0,245,255,0.3)]'
                        : 'bg-surface-container-highest text-secondary',
                    ].join(' ')}
                  >
                    <span
                      className="material-symbols-outlined text-xl"
                      style={{ fontVariationSettings: state === true ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      check
                    </span>
                  </button>
                  <button
                    onClick={() => toggleApproval(job.id, false)}
                    className={[
                      'w-9 h-9 flex items-center justify-center rounded transition-all',
                      state === false
                        ? 'bg-error text-white shadow-[0_0_8px_rgba(255,49,49,0.3)]'
                        : 'bg-surface-container-highest text-error/60',
                    ].join(' ')}
                  >
                    <span
                      className="material-symbols-outlined text-xl"
                      style={{ fontVariationSettings: state === false ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      close
                    </span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="fixed bottom-[72px] left-0 right-0 z-40 bg-surface border-t border-outline-variant/15 px-4 py-2.5 flex justify-between items-center">
          <button
            onClick={() => router.push('/dashboard')}
            className="font-headline font-bold text-[10px] text-secondary uppercase tracking-[0.1em] bg-transparent border-none cursor-pointer"
          >
            BACK
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleRejectAll}
              className="font-headline font-bold text-[10px] text-error border border-error/20 rounded px-3.5 py-2 uppercase tracking-[0.08em] bg-transparent cursor-pointer"
            >
              REJECT ALL
            </button>
            <button
              onClick={() => {
                if (approvedCount === 0) {
                  handleApproveAll()
                }
                setStep('publish')
              }}
              disabled={approvedCount === 0 && rejectedCount === 0}
              className="font-headline font-bold text-[10px] text-on-primary bg-primary-container border-none rounded px-3.5 py-2 uppercase tracking-[0.08em] cursor-pointer disabled:opacity-40"
            >
              {approvedCount > 0 ? `PUBLISH (${approvedCount})` : 'APPROVE ALL'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[640px] mx-auto px-4 pb-6">
      <div className="flex justify-between items-center py-3.5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStep('approval')}
            className="bg-transparent border-none cursor-pointer p-1 text-on-surface-variant flex items-center"
          >
            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
          </button>
          <span className="font-headline font-black text-base uppercase tracking-tight text-primary">
            PUBLISH BOARD
          </span>
        </div>
        <button
          onClick={() => router.push('/sources')}
          className="bg-surface-container-low text-on-surface-variant border border-outline-variant/20 rounded-lg px-3 py-2 font-headline font-black text-[10px] uppercase tracking-[0.08em]"
        >
          MORE
        </button>
      </div>

      <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-4 mb-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.12em] mb-1">
              ROUTING
            </p>
            <h2 className="font-headline font-black text-lg text-on-surface uppercase tracking-[0.02em]">
              Metricool export
            </h2>
          </div>
          <span className="bg-background/70 text-on-surface-variant px-2.5 py-1 rounded-full text-[9px] font-headline font-black uppercase tracking-[0.1em]">
            {approvedJobs.length} CLIPS
          </span>
        </div>

        <p className="text-[11px] text-on-surface-variant uppercase tracking-[0.06em] mb-4">
          {routeHint(defaultDestination)}
        </p>

        <button
          onClick={handleGenerateCaptions}
          disabled={generating || approvedJobs.length === 0}
          className={[
            'w-full py-3 font-headline font-black text-[12px] uppercase tracking-[0.08em] border-none rounded-lg cursor-pointer transition-colors',
            generating
              ? 'bg-surface-container-highest text-on-surface-variant cursor-not-allowed'
              : 'bg-primary-container text-on-primary',
          ].join(' ')}
        >
          {generating ? 'GENERATING...' : `GENERATE TIKTOK CAPTIONS (${approvedJobs.length})`}
        </button>
      </div>

      {approvedJobs.map((job) => {
        const post = postsByClipId[job.id]
        const status = post?.status ?? 'ready'
        const destination = post?.destination ?? defaultDestination
        const videoUrl = post?.video_url || buildPreviewVideoUrl(job)
        const caption = captionDrafts[job.id] ?? ''
        const publishKey = `publish-${job.id}`
        const hasDirectPreview = isDirectVideoAsset(videoUrl)
        const feedback =
          publishFeedbackByClipId[job.id] ||
          (captions.length > 0 && !caption.trim()
            ? 'Captions are generated. Add or refine the draft before publishing.'
            : routeHint(destination))

        return (
          <article
            key={job.id}
            className="bg-surface-container-low border border-outline-variant/20 rounded-xl overflow-hidden mb-5"
          >
            <div className="relative bg-surface-container-highest">
              {hasDirectPreview
                ? (
                    <video
                      className="w-full max-h-[420px] object-cover"
                      controls
                      playsInline
                      src={videoUrl}
                    />
                  )
                : job.post_package.thumbnail
                  ? (
                      <img
                        src={job.post_package.thumbnail}
                        alt={job.post_package.title}
                        className="w-full max-h-[420px] object-cover"
                      />
                    )
                  : <div className="h-[260px] bg-background/40" />}

              <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                <span className="bg-background/80 text-on-surface px-2.5 py-1 rounded-full text-[9px] font-headline font-black uppercase tracking-[0.1em]">
                  {POST_STATUS_LABELS[status]}
                </span>
                <span className="bg-background/80 text-on-surface-variant px-2.5 py-1 rounded-full text-[9px] font-headline font-black uppercase tracking-[0.1em]">
                  Metricool
                </span>
              </div>

              {videoUrl ? (
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-3 right-3 bg-background/80 text-on-surface px-3 py-2 rounded-lg text-[10px] font-headline font-black uppercase tracking-[0.08em] no-underline"
                >
                  OPEN SOURCE
                </a>
              ) : null}
            </div>

            <div className="p-4">
              <div className="mb-4">
                <h3 className="text-sm font-headline font-black text-on-surface uppercase tracking-[0.02em] mb-1">
                  {job.post_package.title}
                </h3>
                <p className="text-[11px] text-on-surface-variant uppercase tracking-[0.08em]">
                  {job.post_package.channelTitle}
                </p>
              </div>

              <label className="block text-[10px] font-headline font-black text-on-surface-variant uppercase tracking-[0.18em] mb-2">
                Caption
              </label>
              <textarea
                value={caption}
                onChange={(event) =>
                  setCaptionDrafts((current) => ({
                    ...current,
                    [job.id]: event.target.value,
                  }))
                }
                className="w-full bg-background/60 border border-outline-variant/20 text-on-surface text-[13px] leading-relaxed p-3 min-h-[130px] resize-y outline-none font-body rounded-lg mb-4"
                placeholder="Write the publish caption for this clip."
              />

              <label className="block text-[10px] font-headline font-black text-on-surface-variant uppercase tracking-[0.18em] mb-2">
                Schedule
              </label>
              <input
                type="datetime-local"
                value={scheduleDrafts[job.id] ?? ''}
                onChange={(event) =>
                  setScheduleDrafts((current) => ({
                    ...current,
                    [job.id]: event.target.value,
                  }))
                }
                className="w-full bg-background/60 border border-outline-variant/20 text-on-surface text-[13px] p-3 outline-none font-body rounded-lg mb-4"
              />

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => copyText(caption, publishKey)}
                  className="flex items-center gap-1.5 text-[10px] font-headline font-bold uppercase tracking-[0.08em] bg-transparent border-none cursor-pointer text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  {copied === publishKey ? 'COPIED' : 'COPY CAPTION'}
                </button>
                <button
                  onClick={() => void handlePublish(job)}
                  disabled={!post || publishingByClipId[job.id]}
                  className={[
                    'px-4 py-2.5 font-headline font-black text-[11px] border-none rounded uppercase tracking-[0.08em] transition-colors',
                    !post || publishingByClipId[job.id]
                      ? 'bg-surface-container-highest text-on-surface-variant cursor-not-allowed'
                      : 'bg-primary-container text-on-primary cursor-pointer',
                  ].join(' ')}
                >
                  {publishingByClipId[job.id] ? 'PUBLISHING...' : 'PUBLISH'}
                </button>
              </div>

              <p className="mt-3 text-[11px] text-on-surface-variant leading-relaxed">
                {feedback}
              </p>
            </div>
          </article>
        )
      })}
    </div>
  )
}
