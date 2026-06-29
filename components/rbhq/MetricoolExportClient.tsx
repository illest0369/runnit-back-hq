'use client'

import { Check, Copy, Download, ExternalLink, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { getCsrfHeaders } from '@/lib/client-csrf'
import { formatMetricoolHashtags, type MetricoolExportItem } from '@/lib/metricool-export-shared'

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function compact(value: string, max = 86) {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 3).trim()}...` : clean
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

export default function MetricoolExportClient() {
  const [items, setItems] = useState<MetricoolExportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/metricool-export', { cache: 'no-store' })
      const json = await readJson(response)
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || 'Metricool export queue unavailable')
      }
      setItems(Array.isArray(json.data) ? json.data : [])
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Metricool export queue unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const readyCount = items.length
  const newest = useMemo(() => items[0]?.createdAt ? formatDate(items[0].createdAt) : 'No clips', [items])

  async function markExported(id: string) {
    setBusyId(id)
    setMessage('')
    try {
      const headers = await getCsrfHeaders()
      const response = await fetch(`/api/metricool-export/${id}/mark-exported`, {
        method: 'POST',
        headers,
      })
      const json = await readJson(response)
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || 'Unable to mark exported')
      }
      setItems((current) => current.filter((item) => item.id !== id))
      setMessage('marked exported')
      setError('')
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Unable to mark exported')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="min-h-dvh bg-black text-white">
      <div className="mx-auto flex w-full max-w-[720px] flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+40px)] pt-[calc(env(safe-area-inset-top,0px)+18px)]">
        <header className="sticky top-0 z-20 -mx-4 border-b border-white/[0.08] bg-black/88 px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff4d00]">Metricool</p>
              <h1 className="mt-1 text-3xl font-black leading-none tracking-tight">Export handoff</h1>
            </div>
            <button
              type="button"
              onClick={() => void loadItems()}
              disabled={loading}
              aria-label="Refresh export queue"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/[0.10] bg-white/[0.06] text-white disabled:opacity-45"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="Ready" value={String(readyCount)} />
            <Metric label="Newest" value={newest} />
          </div>

          {message ? <p className="mt-3 text-xs font-bold lowercase text-[#ff4d00]">{message}</p> : null}
          {error ? <p className="mt-3 text-xs font-bold lowercase text-red-300">{error}</p> : null}
        </header>

        <section className="mt-4 grid gap-3">
          {loading ? (
            <EmptyState title="Loading exports" body="Approved clips are being prepared." />
          ) : items.length === 0 ? (
            <EmptyState title="No exports ready" body="Approved clips will appear here after manual review." />
          ) : (
            items.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#0a0a0a]">
                <div className="grid grid-cols-[96px_1fr] gap-3 p-3">
                  <div className="relative min-h-[132px] overflow-hidden rounded-[16px] bg-white/[0.06]">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-black uppercase text-white">
                      {item.exportState.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <div className="min-w-0 py-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#ff4d00] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-black">
                        {item.channel}
                      </span>
                      <span className="text-[11px] font-bold text-white/44">{formatDate(item.createdAt)}</span>
                    </div>
                    <h2 className="mt-2 text-xl font-black leading-[1.05] tracking-tight">{compact(item.title)}</h2>
                    <p className="mt-2 text-xs font-semibold leading-5 text-white/52">{compact(item.hook, 120)}</p>
                  </div>
                </div>

                <div className="grid gap-3 border-t border-white/[0.07] p-3">
                  <Field label="Caption" value={item.caption} />
                  <Field label="Hashtags" value={formatMetricoolHashtags(item.hashtags)} />
                  <Field label="Source" value={item.sourceUrl || item.sourceName || ''} />

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <ActionButton label="Copy caption" onClick={() => void copyText(item.caption).then(() => setMessage('caption copied'))}>
                      <Copy className="h-4 w-4" />
                    </ActionButton>
                    <ActionButton label="Copy hashtags" onClick={() => void copyText(formatMetricoolHashtags(item.hashtags)).then(() => setMessage('hashtags copied'))}>
                      <Copy className="h-4 w-4" />
                    </ActionButton>
                    <a
                      href={item.exportDownloadUrl}
                      className="grid h-11 place-items-center rounded-[14px] border border-white/[0.08] bg-white/[0.06] text-white active:scale-[0.98]"
                      aria-label="Download export JSON"
                      title="Download export JSON"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <a
                      href={item.mediaDownloadUrl || item.videoUrl || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="grid h-11 place-items-center rounded-[14px] border border-white/[0.08] bg-white/[0.06] text-white active:scale-[0.98]"
                      aria-label="Open media"
                      title="Open media"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => void markExported(item.id)}
                      disabled={busyId === item.id}
                      className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-[14px] bg-white px-3 text-sm font-black text-black active:scale-[0.98] disabled:opacity-55 sm:col-span-1"
                    >
                      <Check className="h-4 w-4" />
                      {busyId === item.id ? 'Saving' : 'Exported'}
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.055] px-3 py-2">
      <p className="truncate text-lg font-black leading-none">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/42">{label}</p>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/38">{label}</p>
      <p className="break-words rounded-[14px] border border-white/[0.08] bg-white/[0.045] px-3 py-2 text-sm font-semibold leading-5 text-white/78">
        {value || '-'}
      </p>
    </div>
  )
}

function ActionButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-11 place-items-center rounded-[14px] border border-white/[0.08] bg-white/[0.06] text-white active:scale-[0.98]"
    >
      {children}
    </button>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-[340px] place-items-center rounded-[22px] border border-white/[0.08] bg-[#0a0a0a] px-6 text-center">
      <div>
        <p className="text-2xl font-black tracking-tight">{title}</p>
        <p className="mx-auto mt-2 max-w-[240px] text-sm font-semibold leading-6 text-white/46">{body}</p>
      </div>
    </div>
  )
}
