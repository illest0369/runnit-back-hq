import { POST_STATUS_LABELS, POST_STATUS_STYLES, type PostWorkflowStatus } from '@/lib/runnitback'

export default function StatusBadge({ status }: { status: PostWorkflowStatus }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2.5 py-1 font-headline text-[0.65rem] font-bold uppercase tracking-[0.16em]',
        POST_STATUS_STYLES[status],
      ].join(' ')}
    >
      {POST_STATUS_LABELS[status]}
    </span>
  )
}
