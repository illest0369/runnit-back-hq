'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import VideoPreview from '@/components/runnitback/VideoPreview'
import {
  COMMENT_RECOMMENDATION_LABELS,
  scoreComment,
  type AppPost,
  type CommentIntelligence,
} from '@/lib/runnitback'

const EMPTY_INTELLIGENCE: CommentIntelligence = {
  type: 'neutral',
  score: 0,
  recommendation: 'ignore',
}

type EngageClientProps = {
  post: AppPost
}

type PersistedEngageState = {
  commentText: string
  replyText: string
  suggestions: string[]
}

export default function EngageClient({ post }: EngageClientProps) {
  const router = useRouter()
  const storageKey = `runnitback:engage:${post.id}`
  const previewUrl = post.video_url ?? post.preview_url ?? post.source_video_url ?? ''
  const [commentText, setCommentText] = useState('')
  const [replyText, setReplyText] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [serverIntelligence, setServerIntelligence] = useState<CommentIntelligence | null>(null)
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isReady, setIsReady] = useState(false)

  const deferredCommentText = useDeferredValue(commentText)
  const localIntelligence = useMemo(
    () => scoreComment(deferredCommentText),
    [deferredCommentText],
  )
  const intelligence =
    commentText.trim().length > 0 ? serverIntelligence ?? localIntelligence : EMPTY_INTELLIGENCE

  useEffect(() => {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PersistedEngageState
        setCommentText(parsed.commentText ?? '')
        setReplyText(parsed.replyText ?? '')
        setSuggestions(Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      } catch {
        localStorage.removeItem(storageKey)
      }
    }

    setIsReady(true)
  }, [storageKey])

  useEffect(() => {
    if (!isReady) {
      return
    }

    const payload: PersistedEngageState = {
      commentText,
      replyText,
      suggestions,
    }

    localStorage.setItem(storageKey, JSON.stringify(payload))
    localStorage.setItem('runnitback:engage:last-post', post.id)
  }, [commentText, isReady, post.id, replyText, storageKey, suggestions])

  useEffect(() => {
    if (!copiedLabel) {
      return
    }

    const timeout = window.setTimeout(() => setCopiedLabel(null), 1800)
    return () => window.clearTimeout(timeout)
  }, [copiedLabel])

  function handleBack() {
    if (window.history.length > 1) {
      router.back()
      return
    }

    router.replace('/queue')
  }

  async function generateSuggestions() {
    if (!commentText.trim()) {
      setFeedback('Paste a TikTok comment first.')
      return
    }

    setFeedback('')
    setIsGenerating(true)

    try {
      const response = await fetch(`/api/posts/${post.id}/suggestions`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentText }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || 'Unable to generate suggestions.')
      }

      const data = (await response.json()) as {
        intelligence: CommentIntelligence
        suggestions: string[]
      }

      setServerIntelligence(data.intelligence)
      setSuggestions(data.suggestions)
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Unable to generate suggestions.',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  async function copyText(value: string, label: string) {
    if (!value.trim()) {
      setFeedback(`Nothing to copy from ${label.toLowerCase()}.`)
      return
    }

    await navigator.clipboard.writeText(value)
    setCopiedLabel(label)
  }

  async function markAsReplied() {
    if (!commentText.trim() || !replyText.trim()) {
      setFeedback('Add both the comment and the final reply before saving.')
      return
    }

    setFeedback('')
    setIsSaving(true)

    try {
      const response = await fetch(`/api/posts/${post.id}/reply-session`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentText,
          finalReplyText: replyText,
          generatedSuggestions: suggestions,
          outcomeType: 'replied',
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || 'Unable to save the reply session.')
      }

      setFeedback('Reply session saved. You can return to Queue when ready.')
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Unable to save the reply session.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  function openStudio() {
    const targetUrl = post.tiktok_url || post.channel.tiktok_profile_url || previewUrl
    const payload: PersistedEngageState = {
      commentText,
      replyText,
      suggestions,
    }

    localStorage.setItem(storageKey, JSON.stringify(payload))
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-background/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),1rem)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/70 bg-surface-container text-on-surface"
            onClick={handleBack}
            type="button"
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <div>
            <p className="font-headline text-[0.72rem] font-bold uppercase tracking-[0.22em] text-on-surface-variant">
              Engage
            </p>
            <p className="pt-1 font-body text-sm text-primary">{post.channel.name}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-4 pb-8 pt-4">
        <section className="overflow-hidden rounded-[1.75rem] border border-outline-variant/60 bg-surface-container">
          <div className="mx-auto max-w-[14rem] border-b border-outline-variant/60" style={{ aspectRatio: '9 / 16' }}>
            <VideoPreview
              mode="player"
              thumbnailUrl={post.thumbnail_url}
              tiktokUrl={post.tiktok_url}
              title={post.hook}
              videoUrl={previewUrl}
            />
          </div>
          <div className="space-y-2 p-4">
            <p className="font-headline text-[0.68rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
              Post Preview
            </p>
            <p className="font-body text-base leading-7 text-on-surface">{post.hook}</p>
            {post.caption ? (
              <p className="font-body text-sm leading-6 text-on-surface-variant">{post.caption}</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-4 rounded-[1.75rem] border border-outline-variant/60 bg-surface-container p-4">
          <div className="space-y-1">
            <p className="font-headline text-[0.68rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
              Comment Input
            </p>
            <p className="font-body text-sm leading-6 text-on-surface-variant">
              Paste the TikTok comment manually. The app scores it, but your reply remains the source of truth.
            </p>
          </div>

          <textarea
            className="min-h-28 w-full rounded-2xl border border-outline-variant/70 bg-background px-4 py-3 font-body text-[0.95rem] leading-6 text-on-surface outline-none placeholder:text-outline"
            onChange={(event) => {
              setCommentText(event.target.value)
              setServerIntelligence(null)
            }}
            placeholder="Paste the comment from TikTok Studio."
            value={commentText}
          />

          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-outline-variant/60 bg-background p-3">
            <div>
              <p className="font-headline text-[0.62rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
                Type
              </p>
              <p className="pt-1 font-body text-sm text-primary">{intelligence.type}</p>
            </div>
            <div>
              <p className="font-headline text-[0.62rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
                Score
              </p>
              <p className="pt-1 font-body text-sm text-primary">{intelligence.score}</p>
            </div>
            <div>
              <p className="font-headline text-[0.62rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
                Recommendation
              </p>
              <p className="pt-1 font-body text-sm text-primary">
                {COMMENT_RECOMMENDATION_LABELS[intelligence.recommendation]}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-[1.75rem] border border-outline-variant/60 bg-surface-container p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-headline text-[0.68rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
                Final Reply
              </p>
              <p className="font-body text-sm leading-6 text-on-surface-variant">
                This box is the reply that gets copied into TikTok.
              </p>
            </div>
            <button
              className="rounded-full border border-outline-variant px-4 py-2 font-headline text-[0.68rem] font-bold uppercase tracking-[0.16em] text-on-surface"
              onClick={() => void generateSuggestions()}
              type="button"
            >
              {isGenerating ? 'Working' : 'Generate Suggestions'}
            </button>
          </div>

          <textarea
            className="min-h-40 w-full rounded-2xl border border-outline-variant/70 bg-background px-4 py-3 font-body text-[1rem] leading-7 text-on-surface outline-none placeholder:text-outline"
            onChange={(event) => setReplyText(event.target.value)}
            placeholder="Write the final reply here."
            value={replyText}
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-headline text-[0.68rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
                Suggestions
              </p>
              <button
                className="rounded-full border border-outline-variant px-4 py-2 font-headline text-[0.68rem] font-bold uppercase tracking-[0.16em] text-on-surface"
                onClick={() => void generateSuggestions()}
                type="button"
              >
                Regenerate
              </button>
            </div>

            {suggestions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-outline-variant/70 px-4 py-5 text-center">
                <p className="font-body text-sm leading-6 text-on-surface-variant">
                  Generate 2–3 optional replies, then insert or copy the one you want.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={`${suggestion}-${index}`}
                    className="space-y-3 rounded-2xl border border-outline-variant/60 bg-background p-4"
                  >
                    <p className="font-body text-sm leading-6 text-on-surface">{suggestion}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="rounded-2xl border border-primary-container px-4 py-3 font-headline text-[0.72rem] font-bold uppercase tracking-[0.16em] text-primary"
                        onClick={() => setReplyText(suggestion)}
                        type="button"
                      >
                        Insert
                      </button>
                      <button
                        className="rounded-2xl border border-outline-variant px-4 py-3 font-headline text-[0.72rem] font-bold uppercase tracking-[0.16em] text-on-surface"
                        onClick={() => void copyText(suggestion, `Suggestion ${index + 1}`)}
                        type="button"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2">
          <button
            className="rounded-2xl border border-primary-container px-4 py-3 font-headline text-[0.75rem] font-bold uppercase tracking-[0.16em] text-primary"
            onClick={() => void copyText(replyText, 'Reply')}
            type="button"
          >
            Copy Reply
          </button>
          <button
            className="rounded-2xl border border-outline-variant px-4 py-3 font-headline text-[0.75rem] font-bold uppercase tracking-[0.16em] text-on-surface"
            onClick={() => void generateSuggestions()}
            type="button"
          >
            Regenerate Suggestions
          </button>
          <button
            className="rounded-2xl border border-secondary px-4 py-3 font-headline text-[0.75rem] font-bold uppercase tracking-[0.16em] text-secondary"
            disabled={isSaving}
            onClick={() => void markAsReplied()}
            type="button"
          >
            {isSaving ? 'Saving' : 'Mark As Replied'}
          </button>
          <button
            className="rounded-2xl border border-outline-variant px-4 py-3 font-headline text-[0.75rem] font-bold uppercase tracking-[0.16em] text-on-surface"
            onClick={openStudio}
            type="button"
          >
            Open In Studio
          </button>
        </section>

        <div className="space-y-1 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {copiedLabel ? (
            <p className="font-body text-sm text-primary">{copiedLabel} copied.</p>
          ) : null}
          {feedback ? (
            <p className="font-body text-sm leading-6 text-on-surface-variant">{feedback}</p>
          ) : null}
        </div>
      </main>
    </div>
  )
}
