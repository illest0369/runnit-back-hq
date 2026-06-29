'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { dedupeQueueJobs } from '@/lib/publish-shared'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://clip-worker-production-6e2f.up.railway.app'

interface Job {
  id: string
  score: number
  status: string
  source_url: string
  post_package: {
    title: string
    thumbnail: string
    channelTitle: string
    viewCount: number
    velocity: number
    url: string
  }
}

export default function QueueClient({ initialJobs, channelId }: { initialJobs: Job[], channelId: string }) {
  const [jobs, setJobs] = useState<Job[]>(() => dedupeQueueJobs(initialJobs))
  const [selected, setSelected] = useState<Job[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const res = await fetch(`${API}/api/refresh/${channelId}`, {
        method: 'POST',
        cache: 'no-store',
      })
      const data = await res.json()
      setJobs(dedupeQueueJobs(data.jobs ?? []))
      setSelected([])
    } catch (e) { console.error(e) }
    finally { setRefreshing(false) }
  }

  function toggle(job: Job) {
    setSelected(prev => {
      const exists = prev.find(j => j.id === job.id)
      if (exists) return prev.filter(j => j.id !== job.id)
      if (prev.length >= 5) return prev
      return [...prev, job]
    })
  }

  function handleReview() {
    sessionStorage.setItem('rb_selected', JSON.stringify(selected))
    sessionStorage.setItem('rb_channel_id', channelId)
    router.push('/review')
  }

  return (
    <div className="p-3">
      {/* Filter row */}
      <div className="flex justify-between items-center mb-4 gap-2">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 bg-primary-container text-on-primary px-3.5 py-1.5 rounded font-headline font-black text-[11px] uppercase tracking-[0.08em] shadow-[0_0_12px_rgba(0,245,255,0.35)] disabled:opacity-60 transition-opacity"
        >
          <span className="material-symbols-outlined text-sm">filter_list</span>
          {refreshing ? 'LOADING...' : 'REFRESH'}
        </button>

        <div className="flex items-center gap-1.5 bg-surface-container px-2.5 py-1.5 rounded opacity-50">
          <div className="w-1.5 h-1.5 rounded-full bg-on-surface-variant animate-pulse" />
          <span className="font-headline font-black text-[10px] text-on-surface-variant uppercase tracking-[0.1em]">LIVE FEED</span>
        </div>
      </div>

      {/* Grid */}
      {jobs.length === 0 ? (
        <div className="border-2 border-dashed border-outline-variant rounded-lg py-16 px-6 text-center mt-8">
          <p className="font-headline font-bold text-sm text-on-surface-variant tracking-[0.05em]">NO CLIPS IN QUEUE</p>
          <p className="text-outline-variant text-xs mt-1.5">Add sources then hit REFRESH</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {jobs.map((job, i) => {
            const p = job.post_package
            const isSelected = selected.some(j => j.id === job.id)
            const disabled = !isSelected && selected.length >= 5
            return (
              <div
                key={job.id}
                onClick={() => !disabled && toggle(job)}
                className={[
                  'relative rounded overflow-hidden flex flex-col transition-all active:scale-[0.97] bg-surface-container-low',
                  isSelected
                    ? 'border-2 border-primary-container shadow-[0_0_20px_rgba(0,245,255,0.25)]'
                    : 'border border-outline-variant/20',
                  disabled ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                {/* 9:16 Thumbnail */}
                <div className="relative overflow-hidden bg-surface-container-highest" style={{ aspectRatio: '9/16' }}>
                  {p?.thumbnail
                    ? <img src={p.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0 bg-surface-container-highest" />
                  }

                  {/* Selection overlay */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-black/65 flex items-center justify-center" style={{ backdropFilter: 'grayscale(100%) brightness(0.5)' }}>
                      <span
                        className="material-symbols-outlined text-[56px] text-primary-container drop-shadow-[0_0_12px_rgba(0,245,255,0.8)]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >check_circle</span>
                    </div>
                  )}

                  {/* Index badge */}
                  <div className="absolute bottom-1.5 right-1.5 bg-background/85 px-1.5 py-0.5 rounded-[3px] text-[9px] font-mono text-primary border border-outline-variant/15">
                    #{String(i + 1).padStart(2, '0')}
                  </div>

                  {/* Velocity badge */}
                  {p?.velocity > 0 && (
                    <div className="absolute top-1.5 right-1.5 bg-background/85 px-1.5 py-0.5 rounded-[3px] text-[9px] font-mono text-primary-container border border-primary-container/20">
                      {p.velocity >= 1000 ? (p.velocity / 1000).toFixed(1) + 'K/H' : Math.round(p.velocity) + '/H'}
                    </div>
                  )}
                </div>

                {/* Card info */}
                <div className="p-2 flex flex-col gap-1">
                  <h3 className={[
                    'text-[10px] font-headline font-bold uppercase tracking-[0.02em] leading-[1.3] line-clamp-2',
                    isSelected ? 'text-primary' : 'text-on-surface',
                  ].join(' ')}>
                    {p?.title}
                  </h3>
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[10px] text-on-surface-variant">source</span>
                    <span className="text-[9px] text-on-surface-variant truncate">{p?.channelTitle}</span>
                  </div>
                  {p?.viewCount > 0 && (
                    <span className="bg-surface-container-highest px-1.5 py-0.5 rounded-[3px] text-[8px] font-headline font-black text-on-surface-variant uppercase self-start">
                      {p.viewCount >= 1e6 ? (p.viewCount / 1e6).toFixed(1) + 'M' : p.viewCount >= 1e3 ? (p.viewCount / 1e3).toFixed(0) + 'K' : p.viewCount}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Floating action bar */}
      {selected.length > 0 && (
        <div className="action-bar-glow fixed bottom-[82px] left-3 right-3 z-40 bg-surface-container-low border border-primary-container/20 rounded-xl px-4 py-3 flex justify-between items-center shadow-[0_20px_50px_rgba(0,0,0,0.9)]">
          <div>
            <div className="font-headline font-black text-sm text-primary-container uppercase tracking-tight leading-none">
              {selected.length} SELECTED
            </div>
            <div className="font-headline font-black text-[9px] text-on-surface-variant/40 uppercase tracking-[0.12em] mt-0.5">
              SYNC PENDING
            </div>
          </div>
          <button
            onClick={handleReview}
            className="bg-primary-container text-on-primary px-7 py-2.5 rounded-lg font-headline font-black text-sm uppercase tracking-[0.02em] shadow-[0_0_20px_rgba(0,245,255,0.5)]"
          >
            REVIEW NOW
          </button>
        </div>
      )}
    </div>
  )
}
