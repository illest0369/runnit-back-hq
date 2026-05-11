"use client";

import { useMemo } from "react";
import {
  getFilteredClips,
  getNeighborPendingClip,
  getNextPendingClip,
  getQueueSummary,
  getClipState,
  type ModerationState,
  type SourceFilter,
} from "@/src/lib/moderationStore";

export function useModerationQueue(state: ModerationState, sourceFilter?: SourceFilter) {
  return useMemo(() => {
    const activeFilter = sourceFilter ?? state.sourceFilter;
    const filtered = getFilteredClips(activeFilter);
    const pending = filtered.filter((clip) => getClipState(state, clip.id).status === "pending");
    const approved = filtered.filter((clip) => getClipState(state, clip.id).status === "approved");
    const rejected = filtered.filter((clip) => getClipState(state, clip.id).status === "rejected");
    const summary = getQueueSummary(state, activeFilter);

    return {
      all: filtered,
      pending,
      approved,
      rejected,
      summary,
      activeFilter,
      nextPendingAfter: (clipId: string) => getNextPendingClip(state, clipId, activeFilter),
      neighborFor: (clipId: string, direction: 1 | -1) => getNeighborPendingClip(state, clipId, activeFilter, direction),
    };
  }, [sourceFilter, state]);
}
