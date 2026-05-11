"use client";

import { memo } from "react";
import { sources } from "@/src/lib/mockData";
import type { SourceFilter } from "@/src/lib/moderationStore";

type Props = {
  active: SourceFilter;
  counts: Record<SourceFilter, number>;
  onSelect: (source: SourceFilter) => void;
};

function SourceStoryRailComponent({ active, counts, onSelect }: Props) {
  const items = [{ id: "all" as const, label: "All", shortLabel: "RB", color: "#f7f3ea" }, ...sources];

  return (
    <nav className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-4 pt-4" aria-label="Clip sources">
      {items.map((source) => {
        const selected = active === source.id;
        return (
          <button
            key={source.id}
            type="button"
            onClick={() => onSelect(source.id)}
            className="group flex min-w-[68px] flex-col items-center gap-2"
            aria-pressed={selected}
          >
            <span
              className="grid h-[58px] w-[58px] place-items-center rounded-full border text-[13px] font-black tracking-[0.18em] transition duration-200 group-active:scale-95"
              style={{
                borderColor: selected ? source.color : "rgba(247,243,234,0.18)",
                color: selected ? "#050506" : source.color,
                background: selected
                  ? `linear-gradient(135deg, ${source.color}, rgba(255,255,255,0.88))`
                  : "rgba(255,255,255,0.05)",
                boxShadow: selected ? `0 0 30px ${source.color}55` : "none",
              }}
            >
              {source.shortLabel}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/60">
              {source.label}
            </span>
            <span className="font-mono text-[9px] text-white/34">{counts[source.id] ?? 0}</span>
          </button>
        );
      })}
    </nav>
  );
}

export const SourceStoryRail = memo(SourceStoryRailComponent);
