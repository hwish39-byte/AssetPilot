"use client";

import { AlertCircle, Clock, Database, Gauge, LockKeyhole, ShieldCheck } from "lucide-react";
import { MetricTile } from "@/components/shared/MetricTile";
import { Panel } from "@/components/shared/Panel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatPercent, formatUtc } from "@/lib/format";
import type { PerplRiskSnapshot } from "@/types/perpl";
import { metricRows } from "./tradeGuardUtils";

export function CurrentRiskPanel({ risk }: { risk: PerplRiskSnapshot }) {
  const highest = [...risk.components].filter((component) => component.applicable).sort((a, b) => (b.weightedContribution ?? -1) - (a.weightedContribution ?? -1))[0];
  const unknown = risk.scoreCoveragePercent < 60;
  const score = risk.score === null || unknown ? "Unavailable" : risk.score;
  const issues = risk.issues.length;

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-signal-live" aria-hidden="true" />
          Current Risk Command Bar
        </span>
      }
      description="Perpl risk intelligence for Monad testnet. Dry-run analysis first, backend-guarded execution only after explicit confirmation."
      actions={
        <>
          <StatusBadge tone={unknown ? "warning" : riskTone(risk.riskLevel)}>{unknown ? "unknown" : risk.riskLevel}</StatusBadge>
          {risk.noExposure ? <StatusBadge tone="success">no exposure</StatusBadge> : null}
          {risk.dataQuality.partialHistory ? <StatusBadge tone="warning">partial data</StatusBadge> : null}
        </>
      }
      className="overflow-hidden"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricTile label="Risk score" value={score} tone={unknown ? "warning" : riskScoreTone(risk.score)} helper="Deterministic score" />
        <MetricTile label="Coverage" value={formatPercent(risk.scoreCoveragePercent, { alreadyPercent: true })} tone={unknown ? "warning" : "live"} helper="Scored inputs" />
        <MetricTile label="Open exposure" value={risk.noExposure ? "None" : "Active"} tone={risk.noExposure ? "success" : "warning"} helper={`${risk.walletMetrics.openPositionCount} positions`} />
        <MetricTile label="Positions" value={risk.walletMetrics.openPositionCount} helper={`${risk.walletMetrics.openOrderCount} orders`} />
        <MetricTile label="Issues" value={issues} tone={issues ? "warning" : "success"} helper={issues ? "Review required" : "No issue"} />
        <MetricTile label="Last calculated" value={formatUtc(risk.calculatedAt)} helper="Risk snapshot" />
      </div>

      <div className="mt-4 grid gap-3 border-t border-terminal-line pt-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {metricRows(risk).map((metric) => (
            <div key={metric.label} className="min-w-0 rounded-md border border-terminal-line bg-terminal-raised/35 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-terminal-muted">{metric.label}</p>
              <p className="mt-1 break-words font-mono text-sm font-semibold tabular-nums text-terminal-text">{metric.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3 text-xs text-terminal-muted">
          <div className="flex items-center gap-2 font-semibold text-terminal-text">
            <LockKeyhole className="h-4 w-4 text-signal-live" aria-hidden="true" />
            Safety boundary
          </div>
          <ul className="mt-2 space-y-1 leading-5">
            <li>Browser never receives Perpl API secrets.</li>
            <li>Testnet execution is backend-gated.</li>
            <li>Receipts are application-layer records with hash-chain verification.</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-terminal-line pt-4 md:grid-cols-3">
        <CommandDatum icon={Gauge} label="Highest contribution" value={highest ? `${highest.label} ${highest.weightedContribution ?? "n/a"}` : "Unavailable"} />
        <CommandDatum icon={Clock} label="Calculated" value={formatUtc(risk.calculatedAt)} />
        <CommandDatum icon={Database} label="History" value={`${risk.history.recordsFetched} records / ${risk.history.pagesFetched} page(s)`} />
      </div>

      {risk.dataQuality.warnings.length || unknown ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-signal-warn/35 bg-signal-warn/10 p-3 text-sm text-signal-warn">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <div>
            <p className="font-semibold">Data quality notice</p>
            <ul className="mt-1 list-inside list-disc text-xs leading-5">
              {unknown ? <li>Coverage below 60%; risk level is treated as unknown.</li> : null}
              {risk.dataQuality.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function CommandDatum({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: typeof Gauge }) {
  return (
    <div className="min-w-0 rounded-md border border-terminal-line bg-terminal-raised/25 p-3">
      <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-terminal-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-sm font-semibold text-terminal-text">{value}</p>
    </div>
  );
}

function riskTone(level: PerplRiskSnapshot["riskLevel"]) {
  if (level === "low") return "success";
  if (level === "medium" || level === "unknown") return "warning";
  return "danger";
}

function riskScoreTone(score: number | null) {
  if (score === null) return "warning";
  if (score < 35) return "success";
  if (score < 70) return "warning";
  return "danger";
}
