"use client";

import { AlertCircle, Clock, Database, Gauge, ShieldCheck } from "lucide-react";
import { RiskBadge } from "@/components/risk/RiskBadge";
import { formatPercent, formatUtc } from "@/lib/format";
import type { PerplRiskSnapshot } from "@/types/perpl";
import { metricRows } from "./tradeGuardUtils";

export function CurrentRiskPanel({ risk }: { risk: PerplRiskSnapshot }) {
  const highest = [...risk.components].filter((component) => component.applicable).sort((a, b) => (b.weightedContribution ?? -1) - (a.weightedContribution ?? -1))[0];
  const unknown = risk.scoreCoveragePercent < 60;

  return (
    <section className="border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-cyan-700" aria-hidden="true" />
            <h1 className="text-lg font-semibold tracking-tight text-slate-950">Trade Guard</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">Perpl risk management workspace. Dry-run only.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge level={unknown ? "unknown" : risk.riskLevel} />
          {risk.noExposure ? <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">no exposure</span> : null}
          {risk.dataQuality.partialHistory ? <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">partial data</span> : null}
        </div>
      </div>

      <div className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-5">
        <RiskRailItem icon={Gauge} label="Risk score" value={risk.score === null || unknown ? "Unavailable" : risk.score} />
        <RiskRailItem label="Coverage" value={formatPercent(risk.scoreCoveragePercent, { alreadyPercent: true })} />
        <RiskRailItem label="Highest contribution" value={highest ? `${highest.label} ${highest.weightedContribution ?? "n/a"}` : "Unavailable"} />
        <RiskRailItem icon={Clock} label="Calculated" value={formatUtc(risk.calculatedAt)} />
        <RiskRailItem icon={Database} label="History" value={`${risk.history.recordsFetched} records / ${risk.history.pagesFetched} page(s)`} />
      </div>

      <div className="grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-3 lg:grid-cols-6">
        {metricRows(risk).map((metric) => (
          <div key={metric.label} className="min-w-0">
            <p className="text-xs font-medium uppercase text-slate-500">{metric.label}</p>
            <p className="mt-1 break-words font-mono text-sm font-semibold text-slate-950">{metric.value}</p>
          </div>
        ))}
      </div>

      {risk.dataQuality.warnings.length || risk.scoreCoveragePercent < 60 ? (
        <div className="mt-3 flex items-start gap-2 border-t border-slate-200 pt-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <div>
            <p className="font-semibold">Data quality notice</p>
            <ul className="mt-1 list-inside list-disc text-xs">
              {risk.scoreCoveragePercent < 60 ? <li>Coverage below 60%; risk level is treated as unknown.</li> : null}
              {risk.dataQuality.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RiskRailItem({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: typeof Gauge }) {
  return (
    <div className="min-w-0 border-l border-slate-200 pl-3">
      <p className="flex items-center gap-1 text-xs font-medium uppercase text-slate-500">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-base font-semibold text-slate-950">{value}</p>
    </div>
  );
}
