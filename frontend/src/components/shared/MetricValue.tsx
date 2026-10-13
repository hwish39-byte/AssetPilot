import type { AnalyticsMetric } from "@/types/perpl";
import { StatusBadge, toneForStatus } from "./StatusBadge";

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
    <span className="font-mono text-terminal-subtle" title={reason ?? "Data is unavailable"}>
      Unavailable
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <StatusBadge tone={toneForStatus(status)}>{status}</StatusBadge>;
}
