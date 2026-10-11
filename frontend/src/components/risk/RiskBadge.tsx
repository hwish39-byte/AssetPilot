import type { RiskLevel, RiskSeverity } from "@/types/perpl";

export function RiskBadge({ level }: { level: RiskLevel | RiskSeverity }) {
  const tone =
    level === "critical" || level === "high"
      ? "border-red-200 bg-red-50 text-red-800"
      : level === "medium"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : level === "low"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-600";
  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold uppercase ${tone}`}>{level}</span>;
}
