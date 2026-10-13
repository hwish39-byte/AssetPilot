import type { ReactNode } from "react";

export type StatusTone = "live" | "success" | "warning" | "danger" | "neutral";

const toneClass: Record<StatusTone, string> = {
  live: "border-signal-live/35 bg-signal-live/10 text-signal-live",
  success: "border-signal-pass/35 bg-signal-pass/10 text-signal-pass",
  warning: "border-signal-warn/35 bg-signal-warn/10 text-signal-warn",
  danger: "border-signal-danger/40 bg-signal-danger/10 text-signal-danger",
  neutral: "border-terminal-line bg-terminal-raised text-terminal-muted"
};

export function StatusBadge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: StatusTone; className?: string }) {
  return <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${toneClass[tone]} ${className}`}>{children}</span>;
}

export function toneForStatus(status: string): StatusTone {
  if (status === "live") return "live";
  if (status === "available" || status === "success" || status === "passed" || status === "accepted" || status === "approved" || status === "approve" || status === "reconciled" || status === "verified") return "success";
  if (status === "partial" || status === "stale" || status === "checking" || status === "reconnecting" || status === "unknown" || status === "timeout" || status === "warning" || status === "revise") return "warning";
  if (status === "unavailable" || status === "failed" || status === "error" || status === "rejected" || status === "reject" || status === "blocked") return "danger";
  return "neutral";
}
