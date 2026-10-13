import type { ReactNode } from "react";

type MetricTone = "default" | "live" | "success" | "warning" | "danger";

const toneClass: Record<MetricTone, string> = {
  default: "border-terminal-line bg-terminal-raised/45",
  live: "border-signal-live/30 bg-signal-live/10",
  success: "border-signal-pass/30 bg-signal-pass/10",
  warning: "border-signal-warn/30 bg-signal-warn/10",
  danger: "border-signal-danger/35 bg-signal-danger/10"
};

export function MetricTile({
  label,
  value,
  helper,
  delta,
  source,
  tone = "default",
  className = ""
}: {
  label: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  delta?: ReactNode;
  source?: ReactNode;
  tone?: MetricTone;
  className?: string;
}) {
  return (
    <div className={`rounded-md border p-3 ${toneClass[tone]} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-terminal-muted">{label}</p>
        {source ? <span className="text-[11px] text-terminal-subtle">{source}</span> : null}
      </div>
      <div className="mt-2 break-words font-mono text-lg font-semibold tabular-nums text-terminal-text">{value}</div>
      {helper || delta ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-terminal-muted">
          {helper ? <span>{helper}</span> : null}
          {delta ? <span>{delta}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
