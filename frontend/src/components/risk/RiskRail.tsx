import { AlertCircle } from "lucide-react";
import { Panel } from "@/components/shared/Panel";
import { formatPercent, formatUtc } from "@/lib/format";
import type { PerplRiskSnapshot } from "@/types/perpl";
import { RiskBadge } from "./RiskBadge";

export function RiskRail({ risk, error }: { risk?: PerplRiskSnapshot | null; error?: unknown }) {
  if (!risk) {
    const message = error instanceof Error ? error.message : "Private Perpl data is not configured.";
    return (
      <Panel tone="warning" className="text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <div>
            <p className="font-semibold">Risk Rail unavailable</p>
            <p className="mt-1">{message}</p>
            <p className="mt-2 text-xs">Public protocol analytics remain available without a Perpl read API key.</p>
          </div>
        </div>
      </Panel>
    );
  }

  const topComponent = [...risk.components]
    .filter((component) => component.weightedContribution !== null)
    .sort((a, b) => (b.weightedContribution ?? -1) - (a.weightedContribution ?? -1))[0];

  return (
    <Panel className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-terminal-muted">Risk Rail</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="font-mono text-4xl font-semibold tabular-nums text-terminal-text">{risk.score ?? "—"}</span>
            <RiskBadge level={risk.riskLevel} />
          </div>
        </div>
        <div className="text-right text-xs text-terminal-muted">
          <p>Coverage</p>
          <p className="font-mono text-sm text-terminal-text">{formatPercent(risk.scoreCoveragePercent, { alreadyPercent: true })}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-terminal-muted">Freshness</dt>
          <dd className="font-mono text-xs text-terminal-text">{formatUtc(risk.calculatedAt)}</dd>
        </div>
        <div>
          <dt className="text-terminal-muted">No exposure</dt>
          <dd className="font-medium text-terminal-text">{risk.noExposure ? "Yes" : "No"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-terminal-muted">Highest contribution</dt>
          <dd className="mt-1 text-terminal-text">{topComponent ? `${topComponent.label}: ${topComponent.weightedContribution}` : "Unavailable"}</dd>
        </div>
      </dl>
      {(risk.dataQuality.partialHistory || risk.dataQuality.stale || risk.dataQuality.warnings.length > 0) && (
        <div className="mt-4 rounded border border-signal-warn/35 bg-signal-warn/10 p-2 text-xs text-signal-warn">
          Partial data: {[risk.dataQuality.partialHistory ? "history" : "", risk.dataQuality.stale ? "stale" : "", ...risk.dataQuality.warnings].filter(Boolean).join(", ")}
        </div>
      )}
    </Panel>
  );
}
