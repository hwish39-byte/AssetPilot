"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { RiskBadge } from "@/components/risk/RiskBadge";
import { formatLeverage, formatPercent, formatUsdValue } from "@/lib/format";
import type { PerplRiskSimulationResult } from "@/types/perpl";

export function RiskComparison({ simulation, title = "Before / after risk" }: { simulation: PerplRiskSimulationResult | null; title?: string }) {
  if (!simulation) {
    return (
      <section className="border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">No simulation result available.</p>
      </section>
    );
  }

  return (
    <section className="border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[760px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="py-2 pr-3">Metric</th>
              <th className="py-2 pr-3">Before</th>
              <th className="py-2 pr-3">After</th>
              <th className="py-2 pr-3">Direction</th>
            </tr>
          </thead>
          <tbody>
            {rows(simulation).map((row) => (
              <tr key={row.label} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-medium text-slate-800">{row.label}</td>
                <td className="py-2 pr-3 font-mono text-slate-700">{row.before}</td>
                <td className="py-2 pr-3 font-mono text-slate-700">{row.after}</td>
                <td className="py-2 pr-3">{direction(row.direction)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase text-slate-500">Changed components</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-[680px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
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
                  <tr key={component.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-800">{component.label}</td>
                    <td className="py-2 pr-3 font-mono">{previous?.score ?? "Unavailable"}</td>
                    <td className="py-2 pr-3 font-mono">{component.score ?? "Unavailable"}</td>
                    <td className="py-2 pr-3 font-mono">{delta === null ? "Unavailable" : delta}</td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{component.evidence.join("; ") || "No evidence"}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={5} className="py-3 text-slate-500">No component changed.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
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
  if (value === "improved") return <span className="inline-flex items-center gap-1 text-emerald-700"><ArrowDownRight className="h-4 w-4" aria-hidden="true" /> Risk improved</span>;
  if (value === "worse") return <span className="inline-flex items-center gap-1 text-red-700"><ArrowUpRight className="h-4 w-4" aria-hidden="true" /> Risk worsened</span>;
  if (value === "coverage") return <span className="inline-flex items-center gap-1 text-slate-600"><ArrowRight className="h-4 w-4" aria-hidden="true" /> Coverage only</span>;
  return <span className="inline-flex items-center gap-1 text-slate-600"><ArrowRight className="h-4 w-4" aria-hidden="true" /> No risk change</span>;
}
