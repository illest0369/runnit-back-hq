"use client";

type Props = {
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
  feedback?: "approve" | "reject" | null;
};

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
      <path
        d="M12.7 2.4c.7 3.8 5.1 5.3 5.1 10.4 0 4.4-2.9 8-6.7 8s-6.8-2.8-6.8-7.2c0-3.6 2.1-5.7 4.5-8.5.1 2.4.9 3.7 2.4 4.6.6-2.6.3-4.5 1.5-7.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

export function ActionRail({ onApprove, onReject, disabled, feedback }: Props) {
  return (
    <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+24px)] right-4 z-30 flex flex-col gap-4">
      <button
        type="button"
        onClick={onApprove}
        disabled={disabled}
        className={`grid h-[64px] w-[64px] place-items-center rounded-full bg-volt text-black shadow-glow transition active:scale-90 ${feedback === "approve" ? "animate-pop" : ""}`}
        aria-label="Approve clip"
      >
        <FlameIcon />
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={disabled}
        className={`grid h-[64px] w-[64px] place-items-center rounded-full bg-heat text-white shadow-heat transition active:scale-90 ${feedback === "reject" ? "animate-pop" : ""}`}
        aria-label="Reject clip"
      >
        <XIcon />
      </button>
    </div>
  );
}
