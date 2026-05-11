import Link from "next/link";
import { memo } from "react";
import type { Clip } from "@/src/lib/mockData";
import type { ClipModerationState } from "@/src/lib/moderationStore";
import { ClipMetadataOverlay } from "./ClipMetadataOverlay";
import { VideoStage } from "./VideoStage";

type Props = {
  clip: Clip;
  state: ClipModerationState;
};

function ClipFeedCardComponent({ clip, state }: Props) {
  return (
    <Link
      href={`/clip/${clip.id}`}
      prefetch
      className="group relative block h-[72svh] min-h-[520px] snap-center overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] shadow-[0_26px_70px_rgba(0,0,0,0.54)] transition-transform duration-300 active:scale-[0.985]"
      aria-label={`Open ${clip.title}`}
    >
      <VideoStage clip={clip} compact />
      <ClipMetadataOverlay clip={clip} state={state} />
      <div className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-full border border-white/12 bg-black/34 backdrop-blur">
          <span className="font-display text-2xl text-white">{clip.score}</span>
        </div>
        <div className="rounded-full border border-white/12 bg-black/34 px-2 py-3 font-mono text-[10px] text-white/70 [writing-mode:vertical-rl]">
          REVIEW
        </div>
      </div>
    </Link>
  );
}

export const ClipFeedCard = memo(ClipFeedCardComponent);
