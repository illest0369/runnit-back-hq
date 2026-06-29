'use client'

import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://clip-worker-production-6e2f.up.railway.app'

interface Comment {
  id: string
  username: string
  text: string
  like_count: number
  replied: boolean
  reply_text: string | null
  tiktok_post_id: string
  created_at: string
}

async function getChannelId(): Promise<string> {
  const res = await fetch('/api/session')
  const data = await res.json()
  return data.channelIds?.[0] || ''
}

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([])
  const [channelId, setChannelId] = useState('')
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [posting, setPosting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getChannelId().then(id => {
      setChannelId(id)
      if (id) fetchComments(id)
    })
  }, [])

  async function fetchComments(id: string) {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/comments/${id}`)
      const data = await res.json()
      setComments(data.comments ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function handleReply(comment: Comment) {
    const text = replyText[comment.id]?.trim()
    if (!text) return
    setPosting(comment.id)
    try {
      await fetch(`${API}/api/comments/${comment.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_text: text, channel_id: channelId })
      })
      setComments(prev => prev.map(c => c.id === comment.id ? { ...c, replied: true, reply_text: text } : c))
      setReplyText(prev => ({ ...prev, [comment.id]: '' }))
    } finally {
      setPosting(null)
    }
  }

  const unreplied = comments.filter(c => !c.replied)
  const replied   = comments.filter(c => c.replied)

  return (
    <div className="p-3 pb-24">
      {/* Header */}
      <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.12em] mb-1">ENGAGEMENT</p>
      <h1 className="font-headline font-black text-[28px] text-on-surface tracking-tight leading-none mb-3">COMMENTS</h1>

      <div className="flex gap-2 items-center mb-6">
        <span className="font-headline font-black text-[9px] text-on-primary bg-primary-container px-2.5 py-1 rounded-full uppercase tracking-[0.08em]">
          {unreplied.length} UNREPLIED
        </span>
        <span className="font-headline font-bold text-[9px] text-on-surface-variant bg-surface-container-high px-2.5 py-1 rounded-full uppercase tracking-[0.08em]">
          {comments.length} TOTAL
        </span>
      </div>

      {loading ? (
        <p className="font-headline text-[11px] text-on-surface-variant uppercase tracking-[0.1em]">LOADING...</p>
      ) : comments.length === 0 ? (
        <div className="border-2 border-dashed border-outline-variant rounded-lg py-16 px-6 text-center">
          <p className="font-headline font-bold text-xs text-on-surface-variant uppercase tracking-[0.06em] mb-1.5">NO COMMENTS YET</p>
          <p className="text-outline-variant text-[11px]">Comments from TikTok will appear here</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {[...unreplied, ...replied].map(comment =>
            comment.replied ? (
              <div key={comment.id} className="bg-surface-container-low border-l-2 border-outline-variant rounded p-3.5 opacity-60">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="font-headline font-black text-xs text-on-surface">@{comment.username}</span>
                  <span className="font-headline font-black text-[8px] text-emerald-400 uppercase tracking-[0.1em]">✓ REPLIED</span>
                </div>
                <p className="text-on-surface-variant text-[13px] leading-relaxed mb-1.5">{comment.text}</p>
                {comment.reply_text && (
                  <p className="text-outline-variant text-[11px] italic">↳ {comment.reply_text}</p>
                )}
              </div>
            ) : (
              <div key={comment.id} className="bg-surface-container-low border-l-2 border-primary-container rounded p-3.5">
                <div className="flex justify-between items-start mb-1.5">
                  <span className="font-headline font-black text-xs text-on-surface">@{comment.username}</span>
                  <span className="font-headline text-[9px] text-on-surface-variant">♥ {comment.like_count}</span>
                </div>
                <p className="text-on-surface text-[13px] leading-relaxed mb-3">{comment.text}</p>
                <div className="flex gap-2">
                  <input
                    placeholder="Write a reply..."
                    value={replyText[comment.id] || ''}
                    onChange={e => setReplyText(prev => ({ ...prev, [comment.id]: e.target.value }))}
                    className="flex-1 bg-surface border-b border-outline-variant px-2.5 py-2 text-on-surface text-xs outline-none font-body placeholder:text-on-surface-variant/40"
                  />
                  <button
                    onClick={() => handleReply(comment)}
                    disabled={posting === comment.id || !replyText[comment.id]?.trim()}
                    className={[
                      'px-4 py-2 font-headline font-black text-[10px] border-none rounded uppercase tracking-[0.06em] cursor-pointer whitespace-nowrap transition-colors',
                      posting === comment.id || !replyText[comment.id]?.trim()
                        ? 'bg-surface-container-highest text-on-surface-variant'
                        : 'bg-primary-container text-on-primary',
                    ].join(' ')}
                  >
                    {posting === comment.id ? '...' : 'REPLY'}
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
