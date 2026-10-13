"use client";

import { AlertTriangle, CheckCircle2, LockKeyhole, ShieldAlert } from "lucide-react";
import { MetricTile } from "@/components/shared/MetricTile";
import { Panel } from "@/components/shared/Panel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { PerplAgentPolicy, PerplAgentWorkflowResponse, PerplRiskSnapshot, PerplTradingCapabilities } from "@/types/perpl";
import { RiskDecisionPanel } from "./RiskDecisionPanel";
import { TestnetExecutionPanel } from "./TestnetExecutionPanel";
import { UserConfirmationPanel } from "./UserConfirmationPanel";
import type { LocalConfirmation } from "./tradeGuardUtils";

interface DecisionDockProps {
  result: PerplAgentWorkflowResponse | null;
  policy: PerplAgentPolicy;
  risk: PerplRiskSnapshot | undefined;
  confirmation: LocalConfirmation | null;
  eligibility: { eligible: boolean; reason: string };
  staleReason: string | null;
  isRunning: boolean;
  workflowError: unknown;
  capabilities: PerplTradingCapabilities | undefined;
  onConfirm: () => void;
  onAbandon: () => void;
}

export function DecisionDock({
  result,
  policy,
  risk,
  confirmation,
  eligibility,
  staleReason,
  isRunning,
  workflowError,
  capabilities,
  onConfirm,
  onAbandon
}: DecisionDockProps) {
  const workflowState = workflowError ? "failed" : staleReason ? "stale" : isRunning ? "running" : result?.state ?? "idle";
  const decision = result?.riskReview.decision ?? "pending";
  const readiness = executionReadiness(result, confirmation, eligibility, staleReason, capabilities);

  return (
    <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-signal-live" aria-hidden="true" />
            Decision Dock
          </span>
        }
        description="Decision review, local confirmation, and backend-gated testnet execution."
        actions={<StatusBadge tone={readiness.tone}>{readiness.label}</StatusBadge>}
      >
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <MiniState label="Workflow" value={workflowState} tone={workflowTone(workflowState)} />
            <MiniState label="Decision" value={decision} tone={decisionTone(decision)} />
            <MiniState label="Eligibility" value={eligibility.eligible ? "eligible" : "blocked"} tone={eligibility.eligible ? "success" : "warning"} />
            <MiniState label="Snapshot" value={staleReason ? "stale" : "current"} tone={staleReason ? "warning" : "success"} />
          </div>

          {result ? (
            <div className="grid grid-cols-3 gap-2">
              <MetricTile label="Before" value={result.riskReview.riskScoreBefore ?? "N/A"} className="p-2" />
              <MetricTile label="After" value={result.riskReview.riskScoreAfter ?? "N/A"} className="p-2" tone={result.riskReview.decision === "approve" ? "success" : "warning"} />
              <MetricTile label="Delta" value={result.riskReview.scoreDelta ?? "N/A"} className="p-2" tone={result.riskReview.scoreDelta !== null && result.riskReview.scoreDelta < 0 ? "success" : "warning"} />
            </div>
          ) : null}

          <div className="rounded-md border border-terminal-line bg-terminal-raised/35 p-3 text-xs leading-5 text-terminal-muted">
            <div className="flex items-center gap-2 font-semibold text-terminal-text">
              <LockKeyhole className="h-4 w-4 text-signal-live" aria-hidden="true" />
              Execution boundary
            </div>
            <p className="mt-2">{readiness.reason}</p>
            <p className="mt-2">Confirmation is local until backend workflow confirmation. Application-layer receipts record review, confirmation, intent, and submission events.</p>
          </div>
        </div>
      </Panel>

      {staleReason ? (
        <Panel tone="warning">
          <div className="flex items-start gap-2 text-sm text-signal-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            <div>
              <p className="font-semibold">Rerun analysis before confirmation.</p>
              <p className="mt-1 text-xs leading-5">{staleReason}</p>
            </div>
          </div>
        </Panel>
      ) : null}

      {!result ? (
        <Panel>
          <div className="flex items-start gap-2 text-sm text-terminal-muted">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-terminal-subtle" aria-hidden="true" />
            <div>
              <p className="font-semibold text-terminal-text">Run analysis to unlock decision review</p>
              <p className="mt-1 text-xs leading-5">The dock will show risk review, local confirmation, and testnet execution readiness after the Agent workflow returns.</p>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <RiskDecisionPanel review={result.riskReview} compact />
          <UserConfirmationPanel result={result} policy={policy} risk={risk} confirmation={confirmation} onConfirm={onConfirm} onAbandon={onAbandon} />
          <TestnetExecutionPanel result={result} confirmation={confirmation} capabilities={capabilities} />
        </>
      )}
    </aside>
  );
}

function MiniState({ label, value, tone }: { label: string; value: string; tone: "live" | "success" | "warning" | "danger" | "neutral" }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-raised/35 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-terminal-subtle">{label}</p>
      <StatusBadge tone={tone} className="mt-1">{value}</StatusBadge>
    </div>
  );
}

function workflowTone(value: string) {
  if (value === "running") return "live";
  if (value === "dry_run_prepared") return "success";
  if (value === "failed" || value === "rejected") return "danger";
  if (value === "stale" || value === "clarification_required") return "warning";
  return "neutral";
}

function decisionTone(value: string) {
  if (value === "approve") return "success";
  if (value === "revise") return "warning";
  if (value === "reject") return "danger";
  return "neutral";
}

function executionReadiness(
  result: PerplAgentWorkflowResponse | null,
  confirmation: LocalConfirmation | null,
  eligibility: { eligible: boolean; reason: string },
  staleReason: string | null,
  capabilities: PerplTradingCapabilities | undefined
) {
  if (!result) return { label: "locked", tone: "neutral" as const, reason: "Run analysis to produce a deterministic risk review and dry-run execution plan." };
  if (staleReason) return { label: "stale", tone: "warning" as const, reason: "Risk inputs or policy changed after this workflow." };
  if (!eligibility.eligible) return { label: "blocked", tone: "warning" as const, reason: eligibility.reason };
  if (!confirmation) return { label: "confirm", tone: "live" as const, reason: "Approve the dry-run plan locally before preparing a backend execution intent." };
  if (!capabilities?.canPrepareIntent) return { label: "server locked", tone: "warning" as const, reason: "Backend execution intent preparation is locked by current Perpl capability checks." };
  if (capabilities.canSubmitOrder) return { label: "testnet ready", tone: "success" as const, reason: "Backend capability checks allow explicit testnet submission after typed confirmation." };
  return { label: "intent only", tone: "live" as const, reason: "Backend can prepare intent preview, but testnet submission remains locked." };
}
