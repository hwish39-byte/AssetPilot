import type { RiskLevel, RiskSeverity } from "@/types/perpl";
import { StatusBadge } from "@/components/shared/StatusBadge";

export function RiskBadge({ level }: { level: RiskLevel | RiskSeverity }) {
  const tone =
    level === "critical" || level === "high"
      ? "danger"
      : level === "medium"
        ? "warning"
        : level === "low"
          ? "success"
          : "neutral";
  return <StatusBadge tone={tone}>{level}</StatusBadge>;
}
