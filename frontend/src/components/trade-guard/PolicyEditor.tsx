"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { Panel } from "@/components/shared/Panel";
import { commitPolicyOnchain, getPolicyCommitmentConfigStatus, type PolicyCommitmentResult } from "@/lib/policyCommitment";
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
  const config = getPolicyCommitmentConfigStatus();
  const [commitment, setCommitment] = useState<{
    status: "idle" | "committing" | "committed" | "error";
    result: PolicyCommitmentResult | null;
    policySnapshot: string | null;
    error: string | null;
  }>({ status: "idle", result: null, policySnapshot: null, error: null });
  const policySnapshot = JSON.stringify(policy);
  const policyChangedAfterCommitment = commitment.status === "committed" && commitment.policySnapshot !== policySnapshot;
  const policyExpired = Date.parse(policy.expiresAt) <= Date.now();
  const commitmentStatus = !config.ready
    ? config.reason
    : commitment.status === "committing"
      ? "committing"
      : policyChangedAfterCommitment
        ? "stale"
        : commitment.status === "committed"
          ? "committed"
          : "ready";

  const update = <K extends keyof PerplAgentPolicy>(key: K, value: PerplAgentPolicy[K]) => {
    setPolicy({ ...policy, [key]: value });
  };

  async function commitPolicy() {
    setCommitment((current) => ({ ...current, status: "committing", error: null }));
    try {
      const result = await commitPolicyOnchain(policy);
      setCommitment({ status: "committed", result, policySnapshot, error: null });
    } catch (commitError) {
      setCommitment((current) => ({
        ...current,
        status: "error",
        error: commitError instanceof Error ? commitError.message : "Policy commitment failed."
      }));
    }
  }

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-signal-live" aria-hidden="true" />
          Application Policy
        </span>
      }
      description="AssetPilot validates these workflow limits before any backend-gated Perpl testnet submission. This is not chain-level enforcement."
    >
      {error ? <p className="rounded-md border border-signal-danger/35 bg-signal-danger/10 px-3 py-2 text-xs font-medium text-signal-danger">{error}</p> : null}

      <div className="mt-4 space-y-3">
        <PolicySection title="Actions" defaultOpen>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {actionOptions.map((option) => {
              const checked = policy.allowedActions.includes(option.value);
              return (
                <label key={option.value} className="flex items-start gap-2 rounded-md border border-terminal-line bg-terminal-raised/35 p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...policy.allowedActions, option.value]
                        : policy.allowedActions.filter((value) => value !== option.value);
                      update("allowedActions", next);
                    }}
                    className="mt-1 h-4 w-4 rounded border-terminal-line bg-terminal-panel text-signal-live focus:ring-signal-live"
                  />
                  <span>
                    <span className="block font-medium text-terminal-text">{option.label}</span>
                    <span className="block text-xs text-terminal-muted">{option.note}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {!policy.allowedActions.includes("place_order") ? <p className="mt-2 text-xs text-terminal-muted">place_order is off by default.</p> : null}
        </PolicySection>

        <PolicySection title="Scope">
          <label className="block text-sm">
            <span className="font-medium text-terminal-muted">Allowed accounts</span>
            <select
              multiple
              value={policy.allowedAccountIds.map(String)}
              onChange={(event) => update("allowedAccountIds", selectedNumbers(event.currentTarget))}
              className={selectClass}
            >
              {(risk?.accountIds ?? []).map((accountId) => <option key={accountId} value={accountId}>Account {accountId}</option>)}
            </select>
          </label>

          <label className="mt-3 block text-sm">
            <span className="font-medium text-terminal-muted">Allowed markets</span>
            <select
              multiple
              value={policy.allowedMarketIds.map(String)}
              onChange={(event) => update("allowedMarketIds", selectedNumbers(event.currentTarget))}
              className={`${selectClass} h-32`}
            >
              {markets.map((market) => <option key={market.id} value={market.id}>{market.symbol} · {market.id}</option>)}
            </select>
          </label>
        </PolicySection>

        <PolicySection title="Limits">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <NumberField label="Max actions" value={policy.maxActionsPerStrategy} min={1} max={5} step={1} onChange={(value) => update("maxActionsPerStrategy", value)} />
            <NumberField label="Max leverage" value={policy.maxLeverage} min={0.1} step={0.1} onChange={(value) => update("maxLeverage", value)} />
            <TextField label="Max order notional USD" value={policy.maxOrderNotionalUsd} onChange={(value) => update("maxOrderNotionalUsd", value)} />
            <TextField label="Max total notional USD" value={policy.maxTotalNotionalUsd} onChange={(value) => update("maxTotalNotionalUsd", value)} />
            <NumberField label="Max slippage bps" value={policy.maxSlippageBps} min={0} max={10_000} step={1} onChange={(value) => update("maxSlippageBps", value)} />
            <NumberField label="Minimum risk score improvement" value={policy.minimumRiskScoreImprovement} min={0} max={100} step={1} onChange={(value) => update("minimumRiskScoreImprovement", value)} />
          </div>

          <label className="mt-3 block text-sm">
            <span className="font-medium text-terminal-muted">Max reduction percentage</span>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={99}
                value={Math.round(policy.maxReductionPercentage * 100)}
                onChange={(event) => update("maxReductionPercentage", Number(event.target.value) / 100)}
                className="min-w-0 flex-1 accent-cyan-400"
              />
              <input
                type="number"
                min={1}
                max={99}
                value={Math.round(policy.maxReductionPercentage * 100)}
                onChange={(event) => update("maxReductionPercentage", Number(event.target.value) / 100)}
                className={`${inputClass} w-20`}
              />
            </div>
          </label>
        </PolicySection>

        <PolicySection title="Requirements">
          <div className="grid gap-2">
            <Toggle label="Allow increase exposure" value={policy.allowIncreaseExposure} onChange={(value) => update("allowIncreaseExposure", value)} />
            <Toggle label="Require simulation" value={policy.requireSimulation} onChange={(value) => update("requireSimulation", value)} />
            <Toggle label="Require risk improvement" value={policy.requireRiskImprovement} onChange={(value) => update("requireRiskImprovement", value)} />
          </div>
        </PolicySection>

        <PolicySection title="Expiry">
          <label className="block text-sm">
            <span className="font-medium text-terminal-muted">Policy expiry</span>
            <input
              type="datetime-local"
              value={toDateTimeLocal(policy.expiresAt)}
              onChange={(event) => update("expiresAt", fromDateTimeLocal(event.target.value))}
              className={`${inputClass} mt-2 w-full`}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => setPolicy({ ...policy, allowedActions: safeDefaultActions, allowIncreaseExposure: false, requireSimulation: true, requireRiskImprovement: true })} size="sm" variant="secondary">
              Restore safe actions
            </Button>
            <Button type="button" onClick={() => update("expiresAt", expiresInMinutes(30))} size="sm" variant="ghost">
              Extend 30 minutes
            </Button>
          </div>
        </PolicySection>

        <div className="rounded-md border border-terminal-line bg-terminal-panel/70 p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-signal-live" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-terminal-text">Optional policy commitment</p>
                  <p className="mt-1 text-xs text-terminal-muted">Commit this policy hash onchain before running the Agent. This is a public audit proof, not onchain policy enforcement.</p>
                </div>
                <span className="rounded-md border border-terminal-line bg-terminal-raised px-2 py-1 text-xs font-semibold uppercase text-terminal-muted">{commitmentStatus}</span>
              </div>

              {policyExpired ? <p className="mt-3 rounded-md border border-signal-danger/35 bg-signal-danger/10 px-3 py-2 text-xs font-medium text-signal-danger">Policy expired. Extend it before committing.</p> : null}
              {policyChangedAfterCommitment ? <p className="mt-3 rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-200">Policy changed after commitment. Commit the updated hash before relying on this proof.</p> : null}
              {commitment.error ? <p className="mt-3 rounded-md border border-signal-danger/35 bg-signal-danger/10 px-3 py-2 text-xs font-medium text-signal-danger">{commitment.error}</p> : null}

              {commitment.result ? (
                <dl className="mt-3 grid gap-2 text-xs text-terminal-muted">
                  <div className="min-w-0">
                    <dt className="font-semibold text-terminal-subtle">Policy hash</dt>
                    <dd className="truncate font-mono text-terminal-text">{commitment.result.policyHash}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-semibold text-terminal-subtle">Transaction</dt>
                    <dd className="truncate font-mono text-terminal-text">{commitment.result.txHash}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-semibold text-terminal-subtle">Submitter</dt>
                    <dd className="truncate font-mono text-terminal-text">{commitment.result.submitter}</dd>
                  </div>
                </dl>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => void commitPolicy()} disabled={!config.ready || !!error || policyExpired || commitment.status === "committing"} size="sm" variant="secondary">
                  {commitment.status === "committing" ? "Committing..." : "Commit policy onchain"}
                </Button>
                {commitment.status === "committed" && !policyChangedAfterCommitment ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-signal-live">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Commitment confirmed
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

const inputClass = "rounded-md border border-terminal-line bg-terminal-raised px-3 py-2 text-sm text-terminal-text placeholder:text-terminal-subtle focus:outline-none focus:ring-2 focus:ring-signal-live";
const selectClass = `${inputClass} mt-2 h-24 w-full`;

function selectedNumbers(select: HTMLSelectElement) {
  return Array.from(select.selectedOptions).map((option) => Number(option.value)).filter(Number.isFinite);
}

function PolicySection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-md border border-terminal-line bg-terminal-raised/25" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-terminal-muted focus:outline-none focus:ring-2 focus:ring-inset focus:ring-signal-live">
        {title}
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-terminal-line p-3">{children}</div>
    </details>
  );
}

function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-terminal-muted">{label}</span>
      <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className={`${inputClass} mt-1 w-full`} />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-terminal-muted">{label}</span>
      <input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} mt-1 w-full`} />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-terminal-line bg-terminal-panel/60 p-2 text-sm">
      <span className="font-medium text-terminal-muted">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`min-w-20 rounded-md border px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-signal-live ${value ? "border-signal-live/45 bg-signal-live/15 text-signal-live" : "border-terminal-line bg-terminal-raised text-terminal-muted"}`}
      >
        {value ? "Enabled" : "Disabled"}
      </button>
    </label>
  );
}
