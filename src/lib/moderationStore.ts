import { clips, sources, type Clip, type ClipSource, type ModerationStatus, type PublishStatus } from "./mockData";

export type SourceFilter = ClipSource | "all";

export type ClipModerationState = {
  status: ModerationStatus;
  publishStatus: PublishStatus;
  decidedAt?: string;
};

export type ModerationState = {
  clips: Record<string, ClipModerationState>;
  sourceFilter: SourceFilter;
};

const STORAGE_KEY = "rbhq.mobileModeration.v1";

export const MODERATION_DECISIONS = {
  approve: "approved",
  reject: "rejected",
} as const;

export const initialModerationState: ModerationState = {
  clips: {},
  sourceFilter: "all",
};

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function readModerationState(): ModerationState {
  if (!canUseStorage()) return initialModerationState;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialModerationState;
    const parsed = JSON.parse(raw) as Partial<ModerationState>;
    return {
      clips: parsed.clips ?? {},
      sourceFilter: parsed.sourceFilter ?? "all",
    };
  } catch {
    return initialModerationState;
  }
}

export function writeModerationState(state: ModerationState) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getClipState(state: ModerationState, clipId: string): ClipModerationState {
  return state.clips[clipId] ?? { status: "pending", publishStatus: "not_ready" };
}

export function approveClip(state: ModerationState, clipId: string): ModerationState {
  return {
    ...state,
    clips: {
      ...state.clips,
      [clipId]: {
        status: "approved",
        publishStatus: "ready_for_manual_publish",
        decidedAt: new Date().toISOString(),
      },
    },
  };
}

export function rejectClip(state: ModerationState, clipId: string): ModerationState {
  return {
    ...state,
    clips: {
      ...state.clips,
      [clipId]: {
        status: "rejected",
        publishStatus: "not_ready",
        decidedAt: new Date().toISOString(),
      },
    },
  };
}

export function setSourceFilter(state: ModerationState, sourceFilter: SourceFilter): ModerationState {
  return { ...state, sourceFilter };
}

export function getFilteredClips(sourceFilter: SourceFilter): Clip[] {
  return clips.filter((clip) => sourceFilter === "all" || clip.source === sourceFilter);
}

export function getPendingClips(state: ModerationState, sourceFilter: SourceFilter): Clip[] {
  return getFilteredClips(sourceFilter).filter((clip) => getClipState(state, clip.id).status === "pending");
}

export function getQueueSummary(state: ModerationState, sourceFilter: SourceFilter = "all") {
  const filtered = getFilteredClips(sourceFilter);
  return filtered.reduce(
    (summary, clip) => {
      const status = getClipState(state, clip.id).status;
      summary[status] += 1;
      return summary;
    },
    { pending: 0, approved: 0, rejected: 0 }
  );
}

export function getSourcePendingCounts(state: ModerationState): Record<SourceFilter, number> {
  const initialCounts = sources.reduce<Record<SourceFilter, number>>(
    (counts, source) => ({ ...counts, [source.id]: 0 }),
    { all: getQueueSummary(state, "all").pending } as Record<SourceFilter, number>
  );

  return sources.reduce<Record<SourceFilter, number>>(
    (counts, source) => {
      counts[source.id] = getQueueSummary(state, source.id).pending;
      return counts;
    },
    initialCounts
  );
}

export function getNextPendingClip(state: ModerationState, currentClipId: string, sourceFilter: SourceFilter): Clip | undefined {
  const pending = getPendingClips(state, sourceFilter).filter((clip) => clip.id !== currentClipId);
  return pending[0];
}

export function getNeighborPendingClip(
  state: ModerationState,
  currentClipId: string,
  sourceFilter: SourceFilter,
  direction: 1 | -1
): Clip | undefined {
  const pending = getPendingClips(state, sourceFilter);
  if (pending.length === 0) return undefined;
  const currentIndex = pending.findIndex((clip) => clip.id === currentClipId);
  if (currentIndex < 0) return pending[0];
  if (pending.length === 1) return pending[0].id === currentClipId ? undefined : pending[0];
  const nextIndex = (currentIndex + direction + pending.length) % pending.length;
  return pending[nextIndex];
}
