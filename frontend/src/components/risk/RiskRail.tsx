import { AlertCircle } from "lucide-react";
import { formatPercent, formatUtc } from "@/lib/format";
import type { PerplRiskSnapshot } from "@/types/perpl";
import { RiskBadge } from "./RiskBadge";

export function RiskRail({ risk, error }: { risk?: PerplRiskSnapshot | null; error?: unknown }) {
  if (!risk) {
    const message = error instanceof Error ? error.message : "Private Perpl data is not configured.";
    return (
      <aside className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <div>
            <p className="font-semibold">Risk Rail unavailable</p>
            <p className="mt-1">{message}</p>
            <p className="mt-2 text-xs">Public protocol analytics remain available without a Perpl read API key.</p>
          </div>
        </div>
      </aside>
    );
  }

  const topComponent = [...risk.components]
    .filter((component) => component.weightedContribution !== null)
    .sort((a, b) => (b.weightedContribution ?? -1) - (a.weightedContribution ?? -1))[0];

  return (
    <aside className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risk Rail</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="font-mono text-4xl font-semibold text-slate-950">{risk.score ?? "—"}</span>
            <RiskBadge level={risk.riskLevel} />
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Coverage</p>
          <p className="font-mono text-sm text-slate-900">{formatPercent(risk.scoreCoveragePercent, { alreadyPercent: true })}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Freshness</dt>
          <dd className="font-mono text-xs text-slate-800">{formatUtc(risk.calculatedAt)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">No exposure</dt>
          <dd className="font-medium text-slate-900">{risk.noExposure ? "Yes" : "No"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Highest contribution</dt>
          <dd className="mt-1 text-slate-900">{topComponent ? `${topComponent.label}: ${topComponent.weightedContribution}` : "Unavailable"}</dd>
        </div>
      </dl>
      {(risk.dataQuality.partialHistory || risk.dataQuality.stale || risk.dataQuality.warnings.length > 0) && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          Partial data: {[risk.dataQuality.partialHistory ? "history" : "", risk.dataQuality.stale ? "stale" : "", ...risk.dataQuality.warnings].filter(Boolean).join(", ")}
        </div>
      )}
    </aside>
  );
}
