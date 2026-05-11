"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Clip } from "@/src/lib/mockData";
import { useLocalClipStore } from "@/src/hooks/useLocalClipStore";
import { useModerationQueue } from "@/src/hooks/useModerationQueue";
import { getClipState } from "@/src/lib/moderationStore";
import { ActionRail } from "./ActionRail";
import { ClipMetadataOverlay } from "./ClipMetadataOverlay";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { VideoStage } from "./VideoStage";

type Props = {
  clip: Clip;
};

export function ModerationPlayer({ clip }: Props) {
  const router = useRouter();
  const { state, hydrated, approve, reject } = useLocalClipStore();
  const queue = useModerationQueue(state, state.sourceFilter);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [progress, setProgress] = useState(0);
  const [feedback, setFeedback] = useState<"approve" | "reject" | "next" | "previous" | null>(null);
  const [toast, setToast] = useState("");
  const touchStart = useRef<{ x: number; y: number; at: number } | null>(null);
  const clipState = getClipState(state, clip.id);
  const currentIndex = Math.max(0, queue.pending.findIndex((item) => item.id === clip.id));
  const displayIndex = queue.pending.length === 0 ? 0 : currentIndex + 1;
  const nextClipInQueue = useMemo(() => queue.nextPendingAfter(clip.id), [clip.id, queue]);
  const previousClip = useMemo(() => queue.neighborFor(clip.id, -1), [clip.id, queue]);
  const nextClip = useMemo(() => queue.neighborFor(clip.id, 1), [clip.id, queue]);

  const goToClip = useCallback((target?: Clip) => {
    if (target) {
      router.push(`/clip/${target.id}`);
      return;
    }
    router.push("/");
  }, [router]);

  useEffect(() => {
    setBusy(false);
    setPaused(false);
    setBuffering(true);
    setProgress(0);
    const readyTimer = window.setTimeout(() => setBuffering(false), 160);
    return () => window.clearTimeout(readyTimer);
  }, [clip.id]);

  useEffect(() => {
    router.prefetch("/");
    if (nextClipInQueue) router.prefetch(`/clip/${nextClipInQueue.id}`);
    if (nextClip) router.prefetch(`/clip/${nextClip.id}`);
    if (previousClip) router.prefetch(`/clip/${previousClip.id}`);
  }, [nextClip, nextClipInQueue, previousClip, router]);

  useEffect(() => {
    if (!hydrated || clipState.status === "pending" || busy) return;
    const target = nextClipInQueue ?? nextClip;
    window.setTimeout(() => goToClip(target), 80);
  }, [busy, clipState.status, goToClip, hydrated, nextClip, nextClipInQueue]);

  useEffect(() => {
    if (paused || buffering) return;
    const timer = window.setInterval(() => {
      setProgress((current) => (current >= 100 ? 0 : current + 1.6));
    }, 260);
    return () => window.clearInterval(timer);
  }, [buffering, paused]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1050);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const advanceAfterDecision = useCallback((target?: Clip) => {
    window.setTimeout(() => goToClip(target), 95);
  }, [goToClip]);

  const navigateNeighbor = useCallback((direction: 1 | -1) => {
    const target = direction > 0 ? nextClip : previousClip;
    if (!target) {
      setToast("Queue complete");
      setFeedback(direction > 0 ? "next" : "previous");
      window.setTimeout(() => setFeedback(null), 180);
      return;
    }
    setFeedback(direction > 0 ? "next" : "previous");
    window.setTimeout(() => goToClip(target), 120);
  }, [goToClip, nextClip, previousClip]);

  const decide = useCallback((decision: "approve" | "reject") => {
    if (busy) return;
    setBusy(true);
    setFeedback(decision);
    if (decision === "approve") approve(clip.id);
    if (decision === "reject") reject(clip.id);
    setToast(decision === "approve" ? "Approved · ready for manual publish" : "Rejected · removed from queue");
    advanceAfterDecision(nextClipInQueue);
  }, [advanceAfterDecision, approve, busy, clip.id, nextClipInQueue, reject]);

  const handleTouchEnd = useCallback((x: number, y: number) => {
    if (!touchStart.current) return;
    const deltaX = x - touchStart.current.x;
    const deltaY = y - touchStart.current.y;
    const elapsed = Math.max(1, Date.now() - touchStart.current.at);
    const velocityY = Math.abs(deltaY) / elapsed;
    touchStart.current = null;

    if ((Math.abs(deltaY) > 46 || velocityY > 0.55) && Math.abs(deltaY) > Math.abs(deltaX)) {
      navigateNeighbor(deltaY < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(deltaX) > 68 && Math.abs(deltaX) > Math.abs(deltaY)) {
      decide(deltaX > 0 ? "approve" : "reject");
    }
  }, [decide, navigateNeighbor]);

  return (
    <main
      className={`relative mx-auto h-dvh w-full max-w-[430px] overflow-hidden bg-black text-white shadow-[0_0_80px_rgba(0,0,0,0.7)] transition-transform duration-150 md:h-[min(860px,100dvh)] ${
        feedback === "approve" ? "translate-x-1" : feedback === "reject" ? "-translate-x-1" : feedback === "next" ? "-translate-y-1" : feedback === "previous" ? "translate-y-1" : ""
      }`}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        handleTouchEnd(touch.clientX, touch.clientY);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") return;
        touchStart.current = { x: event.clientX, y: event.clientY, at: Date.now() };
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") return;
        handleTouchEnd(event.clientX, event.clientY);
      }}
    >
      <KeyboardShortcuts
        onApprove={() => decide("approve")}
        onReject={() => decide("reject")}
        onNext={() => navigateNeighbor(1)}
        onPrevious={() => navigateNeighbor(-1)}
      />

      <div className="absolute inset-0">
        <VideoStage
          clip={clip}
          paused={paused}
          muted={muted}
          buffering={buffering}
          progress={progress}
          onTogglePaused={() => setPaused((current) => !current)}
          onToggleMuted={() => setMuted((current) => !current)}
        />
      </div>

      <header className="absolute inset-x-0 top-0 z-30 flex items-start justify-between px-4 pt-[calc(env(safe-area-inset-top)+14px)]">
        <Link
          href="/"
          className="rounded-full border border-white/12 bg-black/36 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/72 backdrop-blur"
        >
          Feed
        </Link>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-white/12 bg-black/36 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/62 backdrop-blur">
              {displayIndex}/{queue.pending.length || 0}
            </div>
            <div className="rounded-full border border-white/12 bg-black/36 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/62 backdrop-blur">
              {clipState.status === "pending" ? "pending review" : clipState.publishStatus}
            </div>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded-full border border-white/10 bg-black/34 text-center backdrop-blur">
            <div className="px-2.5 py-1.5">
              <p className="font-display text-lg leading-none text-volt">{queue.summary.pending}</p>
              <p className="font-mono text-[7px] uppercase tracking-[0.12em] text-white/38">p</p>
            </div>
            <div className="border-x border-white/10 px-2.5 py-1.5">
              <p className="font-display text-lg leading-none text-cyan-300">{queue.summary.approved}</p>
              <p className="font-mono text-[7px] uppercase tracking-[0.12em] text-white/38">a</p>
            </div>
            <div className="px-2.5 py-1.5">
              <p className="font-display text-lg leading-none text-heat">{queue.summary.rejected}</p>
              <p className="font-mono text-[7px] uppercase tracking-[0.12em] text-white/38">r</p>
            </div>
          </div>
        </div>
      </header>

      <ClipMetadataOverlay clip={clip} state={clipState} mode="player" />
      <ActionRail
        onApprove={() => decide("approve")}
        onReject={() => decide("reject")}
        disabled={busy}
        feedback={feedback === "approve" || feedback === "reject" ? feedback : null}
      />

      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+72px)] z-40 -translate-x-1/2 animate-toast rounded-full border border-white/12 bg-black/60 px-4 py-2 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-white/80 shadow-2xl backdrop-blur-md">
          {toast}
        </div>
      )}

      <aside className="absolute left-4 top-[32%] z-20 -translate-y-1/2 space-y-3">
        <div className="rounded-full border border-white/12 bg-black/34 px-2 py-3 font-mono text-[9px] uppercase tracking-[0.18em] text-white/50 [writing-mode:vertical-rl]">
          swipe up/down
        </div>
      </aside>
    </main>
  );
}
