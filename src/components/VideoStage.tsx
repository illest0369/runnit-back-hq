import { memo } from "react";
import type { Clip } from "@/src/lib/mockData";

type Props = {
  clip: Clip;
  compact?: boolean;
  paused?: boolean;
  muted?: boolean;
  progress?: number;
  buffering?: boolean;
  onTogglePaused?: () => void;
  onToggleMuted?: () => void;
};

function VideoStageComponent({
  clip,
  compact = false,
  paused = false,
  muted = true,
  progress = 0,
  buffering = false,
  onTogglePaused,
  onToggleMuted,
}: Props) {
  return (
    <div
      className="relative h-full min-h-[360px] overflow-hidden rounded-[28px] bg-zinc-950 contain-layout"
      onClick={onTogglePaused}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${clip.posterGradient}`} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_34%,rgba(255,255,255,0.32),transparent_18%),linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.82))]" />
      <div className="absolute left-1/2 top-[22%] h-32 w-20 -translate-x-1/2 rounded-full border border-white/20 bg-black/20 blur-[1px] transition-transform duration-700 will-change-transform" />
      <div
        className="absolute left-1/2 top-[34%] h-44 w-32 -translate-x-1/2 skew-x-[-8deg] rounded-[42%] border border-white/15 bg-white/10 shadow-2xl transition-transform duration-700 will-change-transform"
        style={{ transform: `translateX(-50%) translateY(${paused ? 0 : -6}px) skewX(-8deg)` }}
      />
      <div className="absolute bottom-[25%] left-8 right-8 h-px bg-white/20" />
      <div className="absolute bottom-[22%] left-10 h-16 w-28 rounded-full border border-white/10 bg-black/20 blur-sm" />
      <div className="absolute right-5 top-5 rounded-full border border-white/12 bg-black/30 px-3 py-1 font-mono text-[10px] tracking-[0.18em] text-white/70">
        {clip.duration}
      </div>
      <div className="absolute left-5 top-5 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: clip.accent, boxShadow: `0 0 18px ${clip.accent}` }} />
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/72">{buffering ? "buffering" : "mock video"}</span>
      </div>
      {!compact && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleMuted?.();
          }}
          className="absolute left-5 top-14 z-20 rounded-full border border-white/12 bg-black/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/70 backdrop-blur"
          aria-label={muted ? "Unmute clip" : "Mute clip"}
        >
          {muted ? "muted" : "sound"}
        </button>
      )}
      {!compact && paused && (
        <div className="absolute inset-0 grid place-items-center bg-black/12">
          <div className="grid h-20 w-20 place-items-center rounded-full border border-white/18 bg-black/36 text-white/86 backdrop-blur-md">
            <svg viewBox="0 0 24 24" className="h-9 w-9" aria-hidden="true">
              <path d="M9 7h2v10H9V7Zm4 0h2v10h-2V7Z" fill="currentColor" />
            </svg>
          </div>
        </div>
      )}
      {!compact && (
        <div className="absolute inset-x-5 bottom-5">
          <div className="h-1 overflow-hidden rounded-full bg-white/12">
            <div
              className="h-full rounded-full transition-[width] duration-200 ease-linear"
              style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: clip.accent }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export const VideoStage = memo(VideoStageComponent);
