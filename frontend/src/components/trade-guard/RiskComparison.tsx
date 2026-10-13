"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { RiskBadge } from "@/components/risk/RiskBadge";
import { MetricTile } from "@/components/shared/MetricTile";
import { Panel } from "@/components/shared/Panel";
import { formatLeverage, formatPercent, formatUsdValue } from "@/lib/format";
import type { PerplRiskSimulationResult } from "@/types/perpl";

export function RiskComparison({ simulation, title = "Before / after risk" }: { simulation: PerplRiskSimulationResult | null; title?: string }) {
  if (!simulation) {
    return (
      <Panel title={title}>
        <p className="text-sm text-terminal-muted">No simulation result available.</p>
      </Panel>
    );
  }

  return (
    <Panel title={title} className="min-w-0">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile label="Before" value={simulation.beforeScore ?? "Unavailable"} />
        <MetricTile label="After" value={simulation.afterScore ?? "Unavailable"} tone={simulation.scoreDelta !== null && simulation.scoreDelta < 0 ? "success" : "warning"} />
        <MetricTile label="Delta" value={simulation.scoreDelta ?? "Unavailable"} tone={simulation.scoreDelta !== null && simulation.scoreDelta < 0 ? "success" : "warning"} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[760px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-terminal-line text-xs uppercase tracking-wide text-terminal-muted">
              <th className="py-2 pr-3">Metric</th>
              <th className="py-2 pr-3">Before</th>
              <th className="py-2 pr-3">After</th>
              <th className="py-2 pr-3">Direction</th>
            </tr>
          </thead>
          <tbody>
            {rows(simulation).map((row) => (
              <tr key={row.label} className="border-b border-terminal-line/70 hover:bg-terminal-raised/35">
                <td className="py-2 pr-3 font-medium text-terminal-text">{row.label}</td>
                <td className="py-2 pr-3 font-mono text-terminal-muted">{row.before}</td>
                <td className="py-2 pr-3 font-mono text-terminal-muted">{row.after}</td>
                <td className="py-2 pr-3">{direction(row.direction)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-terminal-muted">Changed components</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-[680px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-terminal-line text-xs uppercase tracking-wide text-terminal-muted">
                <th className="py-2 pr-3">Component</th>
                <th className="py-2 pr-3">Before score</th>
                <th className="py-2 pr-3">After score</th>
                <th className="py-2 pr-3">Delta</th>
                <th className="py-2 pr-3">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {simulation.changedComponents.length ? simulation.changedComponents.map((component) => {
                const previous = simulation.before.components.find((item) => item.id === component.id);
                const delta = previous?.score === null || previous?.score === undefined || component.score === null ? null : component.score - previous.score;
                return (
                  <tr key={component.id} className="border-b border-terminal-line/70 hover:bg-terminal-raised/35">
                    <td className="py-2 pr-3 font-medium text-terminal-text">{component.label}</td>
                    <td className="py-2 pr-3 font-mono text-terminal-muted">{previous?.score ?? "Unavailable"}</td>
                    <td className="py-2 pr-3 font-mono text-terminal-muted">{component.score ?? "Unavailable"}</td>
                    <td className="py-2 pr-3 font-mono text-terminal-muted">{delta === null ? "Unavailable" : delta}</td>
                    <td className="py-2 pr-3 text-xs text-terminal-muted">{component.evidence.join("; ") || "No evidence"}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={5} className="py-3 text-terminal-muted">No component changed.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

function rows(simulation: PerplRiskSimulationResult) {
  const before = simulation.before;
  const after = simulation.after;
  return [
    { label: "Overall score", before: before.score ?? "Unavailable", after: after.score ?? "Unavailable", direction: scoreDirection(before.score, after.score) },
    { label: "Risk level", before: <RiskBadge level={before.riskLevel} />, after: <RiskBadge level={after.riskLevel} />, direction: "neutral" },
    { label: "Score coverage", before: formatPercent(before.scoreCoveragePercent, { alreadyPercent: true }), after: formatPercent(after.scoreCoveragePercent, { alreadyPercent: true }), direction: "coverage" },
    { label: "Gross exposure", before: formatUsdValue(before.walletMetrics.grossPositionNotional, { compact: true, estimated: true }), after: formatUsdValue(after.walletMetrics.grossPositionNotional, { compact: true, estimated: true }), direction: numericDirection(before.walletMetrics.grossPositionNotional, after.walletMetrics.grossPositionNotional, true) },
    { label: "Effective leverage", before: formatLeverage(before.walletMetrics.effectiveLeverageEstimate), after: formatLeverage(after.walletMetrics.effectiveLeverageEstimate), direction: numericDirection(before.walletMetrics.effectiveLeverageEstimate, after.walletMetrics.effectiveLeverageEstimate, true) },
    { label: "Largest position share", before: formatPercent(before.walletMetrics.largestPositionShare), after: formatPercent(after.walletMetrics.largestPositionShare), direction: numericDirection(before.walletMetrics.largestPositionShare, after.walletMetrics.largestPositionShare, true) },
    { label: "Locked balance ratio", before: formatPercent(before.walletMetrics.lockedBalanceRatio), after: formatPercent(after.walletMetrics.lockedBalanceRatio), direction: numericDirection(before.walletMetrics.lockedBalanceRatio, after.walletMetrics.lockedBalanceRatio, true) },
    { label: "Open-order exposure", before: before.walletMetrics.openOrderCount, after: after.walletMetrics.openOrderCount, direction: numericDirection(before.walletMetrics.openOrderCount, after.walletMetrics.openOrderCount, true) },
    { label: "Position count", before: before.walletMetrics.openPositionCount, after: after.walletMetrics.openPositionCount, direction: numericDirection(before.walletMetrics.openPositionCount, after.walletMetrics.openPositionCount, true) },
    { label: "Order count", before: before.walletMetrics.openOrderCount, after: after.walletMetrics.openOrderCount, direction: numericDirection(before.walletMetrics.openOrderCount, after.walletMetrics.openOrderCount, true) }
  ];
}

function scoreDirection(before: number | null, after: number | null) {
  if (before === null || after === null || before === after) return "neutral";
  return after < before ? "improved" : "worse";
}

function numericDirection(beforeValue: unknown, afterValue: unknown, lowerIsBetter: boolean) {
  const before = Number(beforeValue);
  const after = Number(afterValue);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return "neutral";
  const lower = after < before;
  return lower === lowerIsBetter ? "improved" : "worse";
}

function direction(value: string) {
  if (value === "improved") return <span className="inline-flex items-center gap-1 text-signal-pass"><ArrowDownRight className="h-4 w-4" aria-hidden="true" /> Risk improved</span>;
  if (value === "worse") return <span className="inline-flex items-center gap-1 text-signal-danger"><ArrowUpRight className="h-4 w-4" aria-hidden="true" /> Risk worsened</span>;
  if (value === "coverage") return <span className="inline-flex items-center gap-1 text-terminal-muted"><ArrowRight className="h-4 w-4" aria-hidden="true" /> Coverage only</span>;
  return <span className="inline-flex items-center gap-1 text-terminal-muted"><ArrowRight className="h-4 w-4" aria-hidden="true" /> No risk change</span>;
}
