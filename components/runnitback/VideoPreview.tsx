import { isDirectVideoAsset } from '@/lib/runnitback'

type VideoPreviewProps = {
  title: string
  videoUrl: string
  tiktokUrl?: string | null
  thumbnailUrl?: string | null
  mode?: 'poster' | 'player'
}

export default function VideoPreview({
  title,
  videoUrl,
  tiktokUrl,
  thumbnailUrl,
  mode = 'poster',
}: VideoPreviewProps) {
  const directVideo = isDirectVideoAsset(videoUrl)
  const href = tiktokUrl || videoUrl

  if (directVideo) {
    return (
      <video
        className="h-full w-full object-cover"
        controls={mode === 'player'}
        playsInline
        muted={mode === 'poster'}
        preload="metadata"
        poster={thumbnailUrl ?? undefined}
        src={videoUrl}
      />
    )
  }

  if (thumbnailUrl) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        <img
          alt={title}
          className="h-full w-full object-cover"
          src={thumbnailUrl}
        />
        <div className="absolute inset-x-0 bottom-0 border-t border-outline-variant/60 bg-background/90 px-3 py-2">
          <p className="font-headline text-[0.65rem] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
            Preview only
          </p>
        </div>
      </div>
    )
  }

  return (
    <a
      className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface-container text-center no-underline"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <span className="material-symbols-outlined text-5xl text-primary">play_circle</span>
      <div className="space-y-1 px-5">
        <p className="font-headline text-[0.7rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
          Open Preview
        </p>
        <p className="font-body text-sm text-on-surface">{title}</p>
      </div>
    </a>
  )
}
