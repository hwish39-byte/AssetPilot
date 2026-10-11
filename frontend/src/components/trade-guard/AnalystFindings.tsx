"use client";

import { ListChecks } from "lucide-react";
import { RiskBadge } from "@/components/risk/RiskBadge";
import { formatPercent } from "@/lib/format";
import type { PerplAnalystOutput } from "@/types/perpl";

export function AnalystFindings({ analyst }: { analyst: PerplAnalystOutput }) {
  return (
    <section className="border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-cyan-700" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-950">Analyst findings</h2>
      </div>
      <p className="mt-3 text-sm text-slate-700">{analyst.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <RiskBadge level={analyst.riskLevel} />
        <span>Score: <span className="font-mono font-semibold">{analyst.riskScore ?? "Unavailable"}</span></span>
        <span>Coverage: <span className="font-mono font-semibold">{formatPercent(analyst.scoreCoveragePercent, { alreadyPercent: true })}</span></span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase text-slate-500">Primary risk drivers</h3>
          <ul className="mt-2 space-y-2">
            {analyst.primaryRiskDrivers.map((driver) => (
              <li key={driver.componentId} className="border-l border-slate-200 pl-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{driver.label}</span>
                  <RiskBadge level={driver.severity as never} />
                </div>
                <p className="mt-1 font-mono text-xs text-slate-600">score={driver.score ?? "unavailable"} contribution={driver.weightedContribution ?? "unavailable"}</p>
                <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                  {driver.evidence.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          <ListBlock title="Affected positions" items={analyst.affectedPositions.map((item) => `${item.marketSymbol ?? item.marketId} / ${item.positionId}: ${item.reasons.join(", ")}`)} empty="No affected position singled out." />
          <ListBlock title="Affected markets" items={analyst.affectedMarkets.map((item) => `${item.symbol ?? item.marketId}: ${item.reasons.join(", ")}`)} empty="No affected market singled out." />
          <ListBlock title="Data quality concerns" items={analyst.dataQualityConcerns} empty="No analyst data quality concern." />
          <ListBlock title="Recommended objectives" items={analyst.recommendedObjectives} empty="No recommendation." />
        </div>
      </div>
    </section>
  );
}

function ListBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-slate-500">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-slate-700">
        {items.length ? items.map((item) => <li key={item} className="break-words">{item}</li>) : <li className="text-slate-500">{empty}</li>}
      </ul>
    </div>
  );
}
