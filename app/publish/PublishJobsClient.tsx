'use client'

import type { PublishJobRecord } from '@/lib/publish-shared'

const STATUS_ORDER: PublishJobRecord['status'][] = [
  'queued',
  'processing',
  'manual_required',
  'failed',
  'posted',
]

const STATUS_LABELS: Record<PublishJobRecord['status'], string> = {
  queued: 'Queued',
  processing: 'Processing',
  posted: 'Posted',
  failed: 'Failed',
  manual_required: 'Manual Required',
}

function hashtagText(hashtags: string[] | null) {
  return (hashtags ?? [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .join(' ')
}

function copyCaption(job: PublishJobRecord) {
  const text = [job.caption ?? '', hashtagText(job.hashtags)].filter(Boolean).join('\n\n')
  void navigator.clipboard?.writeText(text)
}

export default function PublishJobsClient({ jobs }: { jobs: PublishJobRecord[] }) {
  const grouped = new Map<PublishJobRecord['status'], PublishJobRecord[]>()
  for (const status of STATUS_ORDER) {
    grouped.set(status, [])
  }

  for (const job of jobs) {
    grouped.set(job.status, [...(grouped.get(job.status) ?? []), job])
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5">
      <div>
        <p className="font-headline text-[10px] font-black uppercase tracking-[0.18em] text-primary-container">
          Publishing Layer
        </p>
        <h1 className="font-headline text-2xl font-black uppercase tracking-tight text-on-surface">
          Publish Jobs
        </h1>
      </div>

      {STATUS_ORDER.map((status) => {
        const statusJobs = grouped.get(status) ?? []

        return (
          <section key={status} className="flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
              <h2 className="font-headline text-sm font-black uppercase tracking-[0.1em] text-on-surface">
                {STATUS_LABELS[status]}
              </h2>
              <span className="rounded bg-surface-container-highest px-2 py-1 font-headline text-[10px] font-black text-on-surface-variant">
                {statusJobs.length}
              </span>
            </div>

            {statusJobs.length === 0 ? (
              <p className="py-3 text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-variant/60">
                No jobs
              </p>
            ) : (
              <div className="grid gap-2">
                {statusJobs.map((job) => (
                  <article
                    key={job.id}
                    className="grid gap-3 rounded border border-outline-variant/20 bg-surface-container-low p-3 md:grid-cols-[140px_1fr]"
                  >
                    <a
                      className="flex h-24 items-center justify-center overflow-hidden rounded bg-black text-center text-[10px] font-black uppercase tracking-[0.12em] text-white/70"
                      href={job.video_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open Video
                    </a>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-primary-container px-2 py-1 font-headline text-[9px] font-black uppercase tracking-[0.08em] text-on-primary">
                          {job.channel}
                        </span>
                        <span className="font-mono text-[10px] uppercase text-on-surface-variant">
                          {job.platform} / {job.publish_method}
                        </span>
                      </div>

                      <p className="mt-2 line-clamp-3 text-sm font-medium text-on-surface">
                        {job.caption || 'No caption'}
                      </p>
                      {job.hashtags?.length ? (
                        <p className="mt-1 text-xs text-secondary">{hashtagText(job.hashtags)}</p>
                      ) : null}
                      {job.last_error ? (
                        <p className="mt-2 text-xs font-semibold text-error">{job.last_error}</p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded bg-surface-container-highest px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface"
                          onClick={() => copyCaption(job)}
                          type="button"
                        >
                          Copy Caption
                        </button>
                        {status === 'manual_required' ? (
                          <button
                            className="rounded border border-outline-variant/30 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant"
                            disabled
                            type="button"
                          >
                            Mark Posted Later
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
