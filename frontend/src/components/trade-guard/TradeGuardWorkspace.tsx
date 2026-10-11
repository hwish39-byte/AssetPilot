"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { LoadingSkeleton } from "@/components/shared/State";
import { getPerplMarkets, getPerplOrders, getPerplPositions, getPerplRisk, getPerplTradingCapabilities, runPerplAgentWorkflow, shouldRetryApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import type { PerplAgentPolicy, PerplAgentWorkflowResponse } from "@/types/perpl";
import { AgentWorkflowStatus } from "./AgentWorkflowStatus";
import { AnalystFindings } from "./AnalystFindings";
import { CurrentRiskPanel } from "./CurrentRiskPanel";
import { DryRunExecutionPlan } from "./DryRunExecutionPlan";
import { GoalEditor } from "./GoalEditor";
import { ManualSimulationPanel } from "./ManualSimulationPanel";
import { PolicyEditor } from "./PolicyEditor";
import { RiskComparison } from "./RiskComparison";
import { RiskDecisionPanel } from "./RiskDecisionPanel";
import { StrategyActionList } from "./StrategyActionList";
import { TradeGuardEmptyState } from "./TradeGuardEmptyState";
import { TradeGuardErrorState } from "./TradeGuardErrorState";
import { TestnetExecutionPanel } from "./TestnetExecutionPanel";
import { UserConfirmationPanel } from "./UserConfirmationPanel";
import { buildDefaultPolicy, confirmationEligibility, riskFingerprint, type LocalConfirmation, validateGoal, validatePolicy } from "./tradeGuardUtils";

type Tab = "agent" | "manual";

export function TradeGuardWorkspace() {
  const risk = useQuery({ queryKey: queryKeys.perpl.risk(), queryFn: ({ signal }) => getPerplRisk(signal), staleTime: 10_000, refetchInterval: 15_000, refetchIntervalInBackground: false, retry: shouldRetryApi });
  const positions = useQuery({ queryKey: queryKeys.perpl.positions(), queryFn: ({ signal }) => getPerplPositions(signal), staleTime: 10_000, refetchInterval: 15_000, refetchIntervalInBackground: false, retry: shouldRetryApi });
  const orders = useQuery({ queryKey: queryKeys.perpl.orders(), queryFn: ({ signal }) => getPerplOrders(signal), staleTime: 10_000, refetchInterval: 15_000, refetchIntervalInBackground: false, retry: shouldRetryApi });
  const markets = useQuery({ queryKey: queryKeys.perpl.markets(), queryFn: ({ signal }) => getPerplMarkets(signal), staleTime: 30_000, refetchInterval: 30_000, refetchIntervalInBackground: false, retry: shouldRetryApi });
  const tradingCapabilities = useQuery({ queryKey: queryKeys.perpl.tradingCapabilities(), queryFn: ({ signal }) => getPerplTradingCapabilities(signal), staleTime: 15_000, refetchInterval: 30_000, refetchIntervalInBackground: false, retry: false });

  const [tab, setTab] = useState<Tab>("agent");
  const [goal, setGoal] = useState("Reduce current Perpl risk without increasing exposure.");
  const [policy, setPolicy] = useState<PerplAgentPolicy>(() => buildDefaultPolicy(undefined, undefined));
  const [policyTouched, setPolicyTouched] = useState(false);
  const [result, setResult] = useState<PerplAgentWorkflowResponse | null>(null);
  const [workflowError, setWorkflowError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const [confirmation, setConfirmation] = useState<LocalConfirmation | null>(null);
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!policyTouched && risk.data && markets.data) setPolicy(buildDefaultPolicy(risk.data, markets.data));
  }, [markets.data, policyTouched, risk.data]);

  useEffect(() => {
    if (!result || !risk.data) return;
    if (riskFingerprint(result.riskSnapshot) !== riskFingerprint(risk.data)) {
      setStaleReason("Risk snapshot updated after this workflow. Rerun before confirming.");
      setConfirmation(null);
    }
  }, [result, risk.data]);

  const dataError = risk.error ?? positions.error ?? orders.error ?? markets.error;
  const loading = risk.isLoading || positions.isLoading || orders.isLoading || markets.isLoading;
  const canUseAgent = !!risk.data && !dataError;
  const goalError = validateGoal(goal);
  const policyError = validatePolicy(policy);
  const workflowStale = !!staleReason;
  const eligibility = useMemo(() => confirmationEligibility(result, policy, risk.data), [policy, result, risk.data]);

  function invalidateConfirmation(reason: string) {
    if (result) setStaleReason(reason);
    setConfirmation(null);
  }

  function updateGoal(value: string) {
    setGoal(value);
    invalidateConfirmation("Goal changed. Rerun Agent workflow before confirming.");
  }

  function updatePolicy(value: PerplAgentPolicy) {
    setPolicy(value);
    setPolicyTouched(true);
    invalidateConfirmation("Policy changed. Rerun Agent workflow before confirming.");
  }

  async function runAgent() {
    if (!canUseAgent || goalError || policyError) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setWorkflowError(null);
    setConfirmation(null);
    setStaleReason(null);
    try {
      const response = await runPerplAgentWorkflow({ userGoal: goal.trim(), policy, mode: "dry_run", preferredLanguage: "en" }, controller.signal);
      setResult(response);
    } catch (error) {
      setWorkflowError(error);
    } finally {
      setRunning(false);
    }
  }

  function cancelAgent() {
    controllerRef.current?.abort();
    setRunning(false);
  }

  return (
    <div className="space-y-5">
      {loading ? <LoadingSkeleton rows={5} /> : null}
      {dataError ? <TradeGuardErrorState error={dataError} onRetry={() => { void risk.refetch(); void positions.refetch(); void orders.refetch(); void markets.refetch(); }} title="Perpl risk data unavailable" /> : null}
      {risk.data ? <CurrentRiskPanel risk={risk.data} /> : !loading && !dataError ? <TradeGuardEmptyState title="No risk snapshot" description="Trade Guard needs /api/perpl/risk before any Agent workflow can run." /> : null}

      {risk.data?.noExposure ? <TradeGuardEmptyState title="No open exposure" description="Agent planning remains available, but current risk is already low and most safe strategies will hold." /> : null}

      <div className="border-b border-slate-200" role="tablist" aria-label="Trade Guard mode">
        <div className="flex gap-2 overflow-x-auto">
          <TabButton active={tab === "agent"} onClick={() => setTab("agent")}>Agent plan</TabButton>
          <TabButton active={tab === "manual"} onClick={() => setTab("manual")}>Manual simulation</TabButton>
        </div>
      </div>

      {tab === "agent" ? (
        <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <div className="space-y-5">
            <GoalEditor goal={goal} setGoal={updateGoal} onRun={runAgent} onCancel={cancelAgent} isRunning={running} disabled={!canUseAgent || !!policyError} />
            <PolicyEditor policy={policy} setPolicy={updatePolicy} risk={risk.data} markets={markets.data ?? []} />
          </div>

          <div className="space-y-5">
            <AgentWorkflowStatus result={result} isRunning={running} error={workflowError} stale={workflowStale} />
            {workflowError ? <TradeGuardErrorState error={workflowError} title="Agent workflow failed" /> : null}
            {staleReason ? (
              <div className="flex items-start gap-2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                <p>{staleReason}</p>
              </div>
            ) : null}
            {!result && !running && !workflowError ? <TradeGuardEmptyState title="No Agent run yet" description="Enter a goal, review the application-level policy, then run analysis." /> : null}
            {result ? (
              <>
                <AnalystFindings analyst={result.analyst} />
                <StrategyActionList strategy={result.strategy} positions={positions.data ?? []} orders={orders.data ?? []} markets={markets.data ?? []} />
                <RiskComparison simulation={result.simulation} />
                <RiskDecisionPanel review={result.riskReview} />
                <DryRunExecutionPlan result={result} markets={markets.data ?? []} />
                <UserConfirmationPanel
                  result={result}
                  policy={policy}
                  risk={risk.data}
                  confirmation={confirmation}
                  onConfirm={() => eligibility.eligible && result && setConfirmation({ status: "locally_confirmed", confirmedAt: new Date().toISOString(), workflowId: result.workflowId })}
                  onAbandon={() => { setConfirmation(null); setResult(null); setStaleReason(null); }}
                />
                <TestnetExecutionPanel result={result} confirmation={confirmation} capabilities={tradingCapabilities.data} />
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <ManualSimulationPanel positions={positions.data ?? []} orders={orders.data ?? []} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-10 shrink-0 rounded-t-md border border-b-0 px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-600 ${active ? "border-slate-200 bg-white text-slate-950" : "border-transparent bg-transparent text-slate-600 hover:bg-white/60"}`}
    >
      {children}
    </button>
  );
}
