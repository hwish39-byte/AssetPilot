import type { AnalyticsMetric } from "@/types/perpl";

export function MetricValue<T>({
  metric,
  format,
  className = ""
}: {
  metric: AnalyticsMetric<T> | null | undefined;
  format: (value: T) => string;
  className?: string;
}) {
  if (!metric || metric.status === "unavailable" || metric.value === null) {
    return <UnavailableValue reason={metric?.reason} />;
  }

  return (
    <span className={`font-mono tabular-nums ${className}`} title={metric.methodology}>
      {metric.estimated ? "Est. " : ""}
      {format(metric.value)}
    </span>
  );
}

export function UnavailableValue({ reason }: { reason?: string }) {
  return (
    <span className="font-mono text-slate-500" title={reason ?? "Data is unavailable"}>
      Unavailable
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "available"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "partial" || status === "stale"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-600";
  return <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tone}`}>{status}</span>;
}
