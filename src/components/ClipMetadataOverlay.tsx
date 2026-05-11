import { getSourceMeta, type Clip } from "@/src/lib/mockData";
import type { ClipModerationState } from "@/src/lib/moderationStore";

type Props = {
  clip: Clip;
  state?: ClipModerationState;
  mode?: "feed" | "player";
};

export function ClipMetadataOverlay({ clip, state, mode = "feed" }: Props) {
  const source = getSourceMeta(clip.source);
  const status = state?.status ?? "pending";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/80 via-60% to-transparent p-5 pt-28">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-black"
          style={{ backgroundColor: source.color }}
        >
          {source.label}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">{clip.capturedAt}</span>
        {status !== "pending" && (
          <span className="rounded-full border border-white/15 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/60">
            {status}
          </span>
        )}
      </div>
      <h2 className="max-w-[16rem] text-balance font-display text-[clamp(2rem,10vw,2.75rem)] uppercase leading-[0.86] tracking-normal text-white">
        {clip.title}
      </h2>
      <p className="mt-3 max-w-[18rem] text-[14px] leading-5 text-white/76">{clip.hook}</p>
      {mode === "player" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-[10px] text-white/62">score {clip.score}</span>
          <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-[10px] text-white/62">{clip.momentum}</span>
          {clip.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full bg-white/10 px-3 py-1 font-mono text-[10px] text-white/62">#{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}
