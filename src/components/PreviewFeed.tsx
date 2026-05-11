"use client";

import { useMemo } from "react";
import { clips } from "@/src/lib/mockData";
import { getClipState, getSourcePendingCounts } from "@/src/lib/moderationStore";
import { useLocalClipStore } from "@/src/hooks/useLocalClipStore";
import { useModerationQueue } from "@/src/hooks/useModerationQueue";
import { ClipFeedCard } from "./ClipFeedCard";
import { SourceStoryRail } from "./SourceStoryRail";

export function PreviewFeed() {
  const { state, setFilter } = useLocalClipStore();
  const queue = useModerationQueue(state);
  const counts = useMemo(() => getSourcePendingCounts(state), [state]);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-ink text-white shadow-[0_0_80px_rgba(0,0,0,0.7)] md:h-[min(860px,100dvh)]">
      <header className="flex items-start justify-between px-4 pt-[calc(env(safe-area-inset-top)+14px)]">
        <div>
          <h1 className="font-display text-[34px] uppercase leading-none tracking-normal">RB·HQ</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.24em] text-white/42">Discovery feed</p>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.06] text-center backdrop-blur">
          <div className="px-2.5 py-2">
            <p className="font-display text-2xl leading-none text-volt">{queue.summary.pending}</p>
            <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/42">pend</p>
          </div>
          <div className="border-x border-white/10 px-2.5 py-2">
            <p className="font-display text-2xl leading-none text-cyan-300">{queue.summary.approved}</p>
            <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/42">appr</p>
          </div>
          <div className="px-2.5 py-2">
            <p className="font-display text-2xl leading-none text-heat">{queue.summary.rejected}</p>
            <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/42">rej</p>
          </div>
        </div>
      </header>

      <SourceStoryRail active={queue.activeFilter} counts={counts} onSelect={setFilter} />

      <section className="no-scrollbar flex-1 snap-y snap-mandatory overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+18px)] scroll-smooth">
        {queue.pending.length > 0 ? (
          <div className="flex flex-col gap-4">
            {queue.pending.map((clip) => (
              <ClipFeedCard key={clip.id} clip={clip} state={getClipState(state, clip.id)} />
            ))}
          </div>
        ) : (
          <div className="grid h-full place-items-center px-8 text-center">
            <div>
              <p className="font-display text-6xl uppercase text-volt">Queue clear</p>
              <p className="mt-3 text-sm leading-6 text-white/58">No pending clips in this source. Switch rails or reset local state to replay the mock queue.</p>
              <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/36">
                {clips.length} mock clips loaded
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
