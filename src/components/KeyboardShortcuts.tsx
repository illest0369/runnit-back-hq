"use client";

import { useEffect } from "react";

type Props = {
  onApprove?: () => void;
  onReject?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  enabled?: boolean;
};

export function KeyboardShortcuts({ onApprove, onReject, onNext, onPrevious, enabled = true }: Props) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "a" || key === "f") {
        event.preventDefault();
        onApprove?.();
      }
      if (key === "x" || key === "r" || key === "backspace") {
        event.preventDefault();
        onReject?.();
      }
      if (key === "arrowdown" || key === "j") {
        event.preventDefault();
        onNext?.();
      }
      if (key === "arrowup" || key === "k") {
        event.preventDefault();
        onPrevious?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onApprove, onNext, onPrevious, onReject]);

  return null;
}
