"use client";

import { SlidersHorizontal } from "lucide-react";
import type { PerplAgentActionType, PerplAgentPolicy, PerplMarket, PerplRiskSnapshot } from "@/types/perpl";
import { expiresInMinutes, fromDateTimeLocal, safeDefaultActions, toDateTimeLocal, validatePolicy } from "./tradeGuardUtils";

const actionOptions: Array<{ value: PerplAgentActionType; label: string; note: string }> = [
  { value: "reduce_position", label: "Reduce position", note: "Lower existing exposure" },
  { value: "close_position", label: "Close position", note: "Remove existing exposure" },
  { value: "cancel_order", label: "Cancel order", note: "Remove latent exposure" },
  { value: "add_collateral", label: "Add collateral", note: "Hypothetical only" },
  { value: "place_order", label: "Place order", note: "Dry-run schema only" },
  { value: "hold", label: "Hold", note: "No change" }
];

export function PolicyEditor({
  policy,
  setPolicy,
  risk,
  markets
}: {
  policy: PerplAgentPolicy;
  setPolicy: (policy: PerplAgentPolicy) => void;
  risk: PerplRiskSnapshot | undefined;
  markets: PerplMarket[];
}) {
  const error = validatePolicy(policy);

  const update = <K extends keyof PerplAgentPolicy>(key: K, value: PerplAgentPolicy[K]) => {
    setPolicy({ ...policy, [key]: value });
  };

  return (
    <section className="border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-2 border-b border-slate-200 pb-3">
        <SlidersHorizontal className="mt-0.5 h-4 w-4 text-cyan-700" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Application-level policy for this dry-run workflow</h2>
          <p className="mt-1 text-xs text-slate-600">These limits are enforced by AssetPilot for this Agent run. They are not a chain-level PolicyVault rule.</p>
        </div>
      </div>

      {error ? <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{error}</p> : null}

      <div className="mt-4 grid gap-4">
        <div>
          <p className="text-sm font-medium text-slate-700">Allowed actions</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {actionOptions.map((option) => {
              const checked = policy.allowedActions.includes(option.value);
              return (
                <label key={option.value} className="flex items-start gap-2 rounded-md border border-slate-200 p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...policy.allowedActions, option.value]
                        : policy.allowedActions.filter((value) => value !== option.value);
                      update("allowedActions", next);
                    }}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
                  />
                  <span>
                    <span className="block font-medium text-slate-800">{option.label}</span>
                    <span className="block text-xs text-slate-500">{option.note}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {!policy.allowedActions.includes("place_order") ? <p className="mt-2 text-xs text-slate-500">place_order is off by default.</p> : null}
        </div>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Allowed accounts</span>
          <select
            multiple
            value={policy.allowedAccountIds.map(String)}
            onChange={(event) => update("allowedAccountIds", selectedNumbers(event.currentTarget))}
            className="mt-1 h-24 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-600"
          >
            {(risk?.accountIds ?? []).map((accountId) => <option key={accountId} value={accountId}>Account {accountId}</option>)}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Allowed markets</span>
          <select
            multiple
            value={policy.allowedMarketIds.map(String)}
            onChange={(event) => update("allowedMarketIds", selectedNumbers(event.currentTarget))}
            className="mt-1 h-32 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-600"
          >
            {markets.map((market) => <option key={market.id} value={market.id}>{market.symbol} · {market.id}</option>)}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="Max actions" value={policy.maxActionsPerStrategy} min={1} max={5} step={1} onChange={(value) => update("maxActionsPerStrategy", value)} />
          <NumberField label="Max leverage" value={policy.maxLeverage} min={0.1} step={0.1} onChange={(value) => update("maxLeverage", value)} />
          <TextField label="Max order notional USD" value={policy.maxOrderNotionalUsd} onChange={(value) => update("maxOrderNotionalUsd", value)} />
          <TextField label="Max total notional USD" value={policy.maxTotalNotionalUsd} onChange={(value) => update("maxTotalNotionalUsd", value)} />
          <NumberField label="Max slippage bps" value={policy.maxSlippageBps} min={0} max={10_000} step={1} onChange={(value) => update("maxSlippageBps", value)} />
          <NumberField
            label="Minimum risk score improvement"
            value={policy.minimumRiskScoreImprovement}
            min={0}
            max={100}
            step={1}
            onChange={(value) => update("minimumRiskScoreImprovement", value)}
          />
        </div>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Max reduction percentage</span>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={99}
              value={Math.round(policy.maxReductionPercentage * 100)}
              onChange={(event) => update("maxReductionPercentage", Number(event.target.value) / 100)}
              className="min-w-0 flex-1"
            />
            <input
              type="number"
              min={1}
              max={99}
              value={Math.round(policy.maxReductionPercentage * 100)}
              onChange={(event) => update("maxReductionPercentage", Number(event.target.value) / 100)}
              className="w-20 rounded-md border border-slate-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-600"
            />
          </div>
        </label>

        <div className="grid gap-2">
          <Toggle label="Allow increase exposure" value={policy.allowIncreaseExposure} onChange={(value) => update("allowIncreaseExposure", value)} />
          <Toggle label="Require simulation" value={policy.requireSimulation} onChange={(value) => update("requireSimulation", value)} />
          <Toggle label="Require risk improvement" value={policy.requireRiskImprovement} onChange={(value) => update("requireRiskImprovement", value)} />
        </div>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Policy expiry</span>
          <input
            type="datetime-local"
            value={toDateTimeLocal(policy.expiresAt)}
            onChange={(event) => update("expiresAt", fromDateTimeLocal(event.target.value))}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-600"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPolicy({ ...policy, allowedActions: safeDefaultActions, allowIncreaseExposure: false, requireSimulation: true, requireRiskImprovement: true })} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-600">
            Restore safe actions
          </button>
          <button type="button" onClick={() => update("expiresAt", expiresInMinutes(30))} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-600">
            Extend 30 minutes
          </button>
        </div>
      </div>
    </section>
  );
}

function selectedNumbers(select: HTMLSelectElement) {
  return Array.from(select.selectedOptions).map((option) => Number(option.value)).filter(Number.isFinite);
}

function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-600" />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-600" />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-2 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`min-w-20 rounded-md px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-600 ${value ? "bg-cyan-700 text-white" : "bg-slate-100 text-slate-700"}`}
      >
        {value ? "Enabled" : "Disabled"}
      </button>
    </label>
  );
}
