"use client";

import { ListChecks } from "lucide-react";
import { MetricTile } from "@/components/shared/MetricTile";
import { Panel } from "@/components/shared/Panel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatPercent } from "@/lib/format";
import type { PerplAnalystOutput } from "@/types/perpl";

export function AnalystFindings({ analyst }: { analyst: PerplAnalystOutput }) {
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-signal-live" aria-hidden="true" />
          Analyst findings
        </span>
      }
      actions={<StatusBadge tone={riskTone(analyst.riskLevel)}>{analyst.riskLevel}</StatusBadge>}
      className="min-w-0"
    >
      <p className="text-sm leading-6 text-terminal-muted">{analyst.summary}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MetricTile label="Risk score" value={analyst.riskScore ?? "Unavailable"} />
        <MetricTile label="Coverage" value={formatPercent(analyst.scoreCoveragePercent, { alreadyPercent: true })} tone={analyst.scoreCoveragePercent < 60 ? "warning" : "live"} />
        <MetricTile label="Drivers" value={analyst.primaryRiskDrivers.length} helper="Primary risk signals" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-terminal-muted">Primary risk drivers</h3>
          <ul className="mt-2 space-y-2">
            {analyst.primaryRiskDrivers.map((driver) => (
              <li key={driver.componentId} className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-terminal-text">{driver.label}</span>
                  <StatusBadge tone={driver.severity === "critical" || driver.severity === "high" ? "danger" : "warning"}>{driver.severity}</StatusBadge>
                </div>
                <p className="mt-1 font-mono text-xs text-terminal-muted">score={driver.score ?? "unavailable"} contribution={driver.weightedContribution ?? "unavailable"}</p>
                <ul className="mt-2 list-inside list-disc text-xs leading-5 text-terminal-muted">
                  {driver.evidence.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <ListBlock title="Affected positions" items={analyst.affectedPositions.map((item) => `${item.marketSymbol ?? item.marketId} / ${item.positionId}: ${item.reasons.join(", ")}`)} empty="No affected position singled out." />
          <ListBlock title="Affected markets" items={analyst.affectedMarkets.map((item) => `${item.symbol ?? item.marketId}: ${item.reasons.join(", ")}`)} empty="No affected market singled out." />
          <ListBlock title="Assumptions / data gaps" items={analyst.dataQualityConcerns} empty="No analyst data quality concern." />
          <ListBlock title="Recommended objectives" items={analyst.recommendedObjectives} empty="No recommendation." />
        </div>
      </div>
    </Panel>
  );
}

function riskTone(level: string) {
  if (level === "low") return "success";
  if (level === "medium" || level === "unknown") return "warning";
  return "danger";
}

function ListBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-terminal-muted">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-terminal-muted">
        {items.length ? items.map((item) => <li key={item} className="break-words">{item}</li>) : <li className="text-terminal-subtle">{empty}</li>}
      </ul>
    </div>
  );
}
