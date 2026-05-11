"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveClip,
  getClipState,
  initialModerationState,
  readModerationState,
  rejectClip,
  setSourceFilter,
  type SourceFilter,
  type ModerationState,
  writeModerationState,
} from "@/src/lib/moderationStore";

export function useLocalClipStore() {
  const [state, setState] = useState<ModerationState>(initialModerationState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(readModerationState());
    setHydrated(true);
  }, []);

  const commit = useCallback((next: ModerationState) => {
    setState(next);
    writeModerationState(next);
  }, []);

  const approve = useCallback((clipId: string) => {
    setState((current) => {
      const next = approveClip(current, clipId);
      writeModerationState(next);
      return next;
    });
  }, []);

  const reject = useCallback((clipId: string) => {
    setState((current) => {
      const next = rejectClip(current, clipId);
      writeModerationState(next);
      return next;
    });
  }, []);

  const setFilter = useCallback((sourceFilter: SourceFilter) => {
    setState((current) => {
      const next = setSourceFilter(current, sourceFilter);
      writeModerationState(next);
      return next;
    });
  }, []);

  const actions = useMemo(() => ({
    approve,
    reject,
    setFilter,
    getStateForClip: (clipId: string) => getClipState(state, clipId),
  }), [approve, reject, setFilter, state]);

  return { state, hydrated, ...actions };
}
