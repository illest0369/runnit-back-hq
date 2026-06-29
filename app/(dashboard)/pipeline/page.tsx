// LEGACY — not used in active ingest pipeline
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { isProductionBuild } from '@/lib/runtime'

export default async function PipelinePage() {
  if (isProductionBuild()) {
    return (
      <div className="p-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.14em] mb-0.5">PROCESSING</p>
            <h1 className="font-headline font-black text-2xl text-on-surface tracking-tight leading-none">PIPELINE</h1>
          </div>
          <div className="flex items-center gap-1.5 bg-surface-container px-2.5 py-1.5 rounded">
            <div className="w-1.5 h-1.5 rounded-full bg-outline-variant" />
            <span className="font-headline font-black text-[10px] text-on-surface-variant uppercase tracking-[0.1em]">IDLE</span>
          </div>
        </div>
        <div className="border-2 border-dashed border-outline-variant rounded-lg py-12 px-6 text-center">
          <p className="font-headline text-xs text-on-surface-variant tracking-[0.06em] uppercase">BUILD MODE</p>
          <p className="text-outline-variant text-[11px] mt-1.5">Pipeline data loads at runtime.</p>
        </div>
      </div>
    )
  }

  const { hasSupabaseEnv, supabaseAdmin } = await import('@/lib/supabase')

  if (!hasSupabaseEnv) {
    return (
      <div className="p-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.14em] mb-0.5">PROCESSING</p>
            <h1 className="font-headline font-black text-2xl text-on-surface tracking-tight leading-none">PIPELINE</h1>
          </div>
          <div className="flex items-center gap-1.5 bg-surface-container px-2.5 py-1.5 rounded">
            <div className="w-1.5 h-1.5 rounded-full bg-outline-variant" />
            <span className="font-headline font-black text-[10px] text-on-surface-variant uppercase tracking-[0.1em]">IDLE</span>
          </div>
        </div>
        <div className="border-2 border-dashed border-outline-variant rounded-lg py-12 px-6 text-center">
          <p className="font-headline text-xs text-on-surface-variant tracking-[0.06em] uppercase">BUILD MODE</p>
          <p className="text-outline-variant text-[11px] mt-1.5">Pipeline data loads at runtime.</p>
        </div>
      </div>
    )
  }

  const session = await getSession()
  if (!session) redirect('/login')

  const { data: jobs } = await supabaseAdmin
    .from('queue_jobs')
    .select('id, status, created_at, post_package, channel_id')
    .in('channel_id', session.channelIds)
    .order('created_at', { ascending: false })
    .limit(50)

  const all = jobs ?? []
  const counts = {
    queued:     all.filter(j => j.status === 'pending').length,
    processing: all.filter(j => j.status === 'processing').length,
    complete:   all.filter(j => j.status === 'published' || j.status === 'approved').length,
    failed:     all.filter(j => j.status === 'failed').length,
  }

  const STATS = [
    { label: 'QUEUED',     value: counts.queued,     sub: 'Tasks',   accentCls: 'border-outline-variant text-outline-variant',    valueCls: 'text-on-surface',  pulse: false },
    { label: 'PROCESSING', value: counts.processing, sub: 'Live',    accentCls: 'border-primary-container text-primary-container', valueCls: 'text-primary',     pulse: true  },
    { label: 'COMPLETE',   value: counts.complete,   sub: 'Success', accentCls: 'border-emerald-400 text-emerald-400',             valueCls: 'text-on-surface',  pulse: false },
    { label: 'FAILED',     value: counts.failed,     sub: 'Error',   accentCls: 'border-error text-error',                        valueCls: 'text-on-surface',  pulse: false },
  ]

  return (
    <div className="p-3">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.14em] mb-0.5">PROCESSING</p>
          <h1 className="font-headline font-black text-2xl text-on-surface tracking-tight leading-none">PIPELINE</h1>
        </div>
        <div className="flex items-center gap-1.5 bg-surface-container px-2.5 py-1.5 rounded">
          <div className={`w-1.5 h-1.5 rounded-full ${counts.processing > 0 ? 'bg-primary-container animate-ping' : 'bg-outline-variant'}`} />
          <span className="font-headline font-black text-[10px] text-on-surface-variant uppercase tracking-[0.1em]">
            {counts.processing > 0 ? 'ACTIVE' : 'IDLE'}
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        {STATS.map(stat => (
          <div key={stat.label} className={`bg-surface-container-low p-3 border-l-2 rounded relative ${stat.accentCls.split(' ')[0]}`}>
            {stat.pulse && counts.processing > 0 && (
              <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-primary-container animate-ping" />
            )}
            <p className={`text-[9px] font-headline font-bold uppercase tracking-[0.12em] mb-0.5 ${stat.accentCls.split(' ')[1]}`}>{stat.label}</p>
            <div className="flex items-baseline gap-1">
              <span className={`text-[36px] font-headline font-black tracking-tight leading-none ${stat.valueCls}`}>
                {String(stat.value).padStart(2, '0')}
              </span>
              <span className={`text-[9px] font-headline font-bold uppercase tracking-[0.06em] ${stat.accentCls.split(' ')[1]}`}>{stat.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Job list header */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="material-symbols-outlined text-sm text-on-surface-variant">reorder</span>
        <span className="font-headline font-bold text-[11px] text-on-surface-variant uppercase tracking-[0.08em]">Active Processing Queue</span>
      </div>

      {all.length === 0 ? (
        <div className="border-2 border-dashed border-outline-variant rounded-lg py-12 px-6 text-center">
          <p className="font-headline text-xs text-on-surface-variant tracking-[0.06em] uppercase">NO JOBS YET</p>
          <p className="text-outline-variant text-[11px] mt-1.5">Select clips in Queue to start</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {all.map(job => {
            const title = job.post_package?.title || `Job ${job.id.slice(0, 8)}`
            const thumb = job.post_package?.thumbnail
            const time = new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            const isProcessing = job.status === 'processing'
            const isFailed = job.status === 'failed'
            const isComplete = job.status === 'published' || job.status === 'approved'

            const statusBadge = isProcessing
              ? 'bg-primary-container text-on-primary'
              : isComplete
              ? 'bg-emerald-400 text-black'
              : isFailed
              ? 'bg-error text-white'
              : 'bg-surface-container-highest text-on-surface-variant'

            const statusLabel = isProcessing ? 'PROCESSING' : isComplete ? 'COMPLETE' : isFailed ? 'FAILED' : 'QUEUED'

            return (
              <div
                key={job.id}
                className={[
                  'bg-surface-container-low rounded overflow-hidden',
                  isFailed ? 'border-l-[3px] border-error' : isProcessing ? 'border-l-[3px] border-primary-container' : 'border-l-[3px] border-transparent',
                ].join(' ')}
              >
                <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container transition-colors">
                  {/* Thumbnail */}
                  <div className="w-9 h-[50px] flex-shrink-0 rounded-[3px] overflow-hidden bg-surface-container-highest relative">
                    {thumb && (
                      <img
                        src={thumb}
                        className="w-full h-full object-cover"
                        style={{ opacity: isFailed ? 0.2 : isProcessing ? 0.5 : 0.6, filter: 'grayscale(40%)' }}
                        alt=""
                      />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[8px] font-headline font-black px-1.5 py-0.5 tracking-[0.1em] rounded-[2px] ${statusBadge}`}>
                        {statusLabel}
                      </span>
                      <span className="text-[9px] font-mono text-on-surface-variant">{time}</span>
                    </div>
                    <h3 className="text-[13px] font-headline font-black text-on-surface tracking-tight truncate">{title}</h3>
                    {isFailed ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="material-symbols-outlined text-xs text-error" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                        <span className="font-headline font-black text-[10px] text-error uppercase tracking-[0.04em]">SOURCE UNAVAILABLE</span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-[0.06em] mt-0.5">
                        JOB ID: RB-{job.id.slice(0, 6).toUpperCase()}
                      </p>
                    )}
                  </div>

                  {/* Action icon */}
                  {isProcessing && (
                    <span className="material-symbols-outlined text-2xl text-primary-container flex-shrink-0 animate-spin">sync</span>
                  )}
                  {isFailed && (
                    <button className="bg-error text-white text-[10px] font-headline font-black px-3.5 py-2 rounded flex-shrink-0 uppercase tracking-[0.06em] shadow-[0_2px_12px_rgba(255,49,49,0.2)]">
                      RETRY
                    </button>
                  )}
                  {isComplete && (
                    <span className="material-symbols-outlined text-[22px] text-emerald-400 flex-shrink-0">open_in_new</span>
                  )}
                </div>

                {/* Processing progress bar */}
                {isProcessing && (
                  <div className="h-0.5 bg-surface-container-highest">
                    <div className="h-full w-[64%] bg-primary-container transition-all duration-500" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
