'use client'

import { useState, useEffect } from 'react'

interface Source {
  id: string
  url: string
  platform: string
  category: string | null
  active: boolean
}

async function getChannelId(): Promise<string> {
  const res = await fetch('/api/session')
  const data = await res.json()
  return data.channelIds?.[0] || ''
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [channelId, setChannelId] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getChannelId().then(id => {
      setChannelId(id)
      if (id) {
        fetchSources(id)
      }
    })
  }, [])

  async function fetchSources(id: string) {
    const res = await fetch(`/api/sources/${id}`, { cache: 'no-store' })
    const data = await res.json()
    setSources(data.sources ?? [])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newUrl.trim() || !channelId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/sources/${channelId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl.trim(), platform: 'youtube' })
      })
      const data = await res.json()
      if (data.source) { setSources(prev => [...prev, data.source]); setNewUrl('') }
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(id: string) {
    await fetch(`/api/sources/${id}`, { method: 'DELETE' })
    setSources(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="p-3 pb-24">
      <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.12em] mb-1">CONTENT SOURCES</p>
      <h1 className="font-headline font-black text-[28px] text-on-surface tracking-tight leading-none mb-1">SOURCES</h1>
      <p className="text-[11px] text-on-surface-variant uppercase tracking-[0.06em] mb-6">YouTube channels to monitor</p>

      <section className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-4 mb-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.12em] mb-1">DISTRIBUTION</p>
            <h2 className="font-headline font-black text-base text-on-surface uppercase tracking-[0.04em]">Metricool only</h2>
          </div>
          <span className="bg-surface-container-highest text-on-surface-variant px-2.5 py-1 rounded-full text-[9px] font-headline font-black uppercase tracking-[0.1em]">
            Metricool
          </span>
        </div>

        <p className="text-[11px] text-on-surface-variant uppercase tracking-[0.06em] mb-4">
          Publishing is handled in Metricool. Approved clips move to the Metricool export queue after render completes.
        </p>

        <a
          href="/metricool"
          className="inline-flex items-center justify-center px-4 py-2.5 font-headline font-black text-[10px] border-none rounded uppercase tracking-[0.08em] bg-primary-container text-on-primary"
        >
          Open Metricool export
        </a>
      </section>

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="YouTube Channel ID (UC...)"
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          className="flex-1 bg-surface-container-low border-b border-outline-variant px-3 py-2.5 text-on-surface text-xs outline-none font-body rounded-t placeholder:text-on-surface-variant/50"
        />
        <button
          type="submit"
          disabled={loading || !newUrl.trim()}
          className={[
            'px-4 py-2.5 font-headline font-black text-[10px] border-none rounded uppercase tracking-[0.08em] transition-colors',
            loading || !newUrl.trim()
              ? 'bg-surface-container-highest text-on-surface-variant cursor-not-allowed'
              : 'bg-primary-container text-on-primary cursor-pointer',
          ].join(' ')}
        >
          ADD
        </button>
      </form>

      {/* Source list */}
      {sources.length === 0 ? (
        <div className="border-2 border-dashed border-outline-variant rounded-lg py-12 px-6 text-center">
          <p className="font-headline font-bold text-xs text-on-surface-variant uppercase tracking-[0.06em] mb-1.5">NO SOURCES YET</p>
          <p className="text-outline-variant text-[11px]">Add a YouTube Channel ID above</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sources.map(s => (
            <div
              key={s.id}
              className="flex items-center justify-between bg-surface-container-low border-l-2 border-outline-variant rounded px-3.5 py-3"
            >
              <div>
                <p className="font-headline font-black text-[13px] text-on-surface mb-0.5 tracking-tight">{s.url}</p>
                <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.1em]">{s.platform}</p>
              </div>
              <button
                onClick={() => handleRemove(s.id)}
                className="font-headline font-black text-[10px] text-error bg-transparent border-none cursor-pointer uppercase tracking-[0.06em]"
              >
                REMOVE
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
