"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { Panel } from "@/components/shared/Panel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { PerplAgentWorkflowResponse } from "@/types/perpl";

const steps: Array<{ key: PerplAgentWorkflowResponse["state"] | "data_loaded"; label: string }> = [
  { key: "data_loaded", label: "Data loaded" },
  { key: "analyzed", label: "Analyzed" },
  { key: "strategy_generated", label: "Strategy" },
  { key: "risk_reviewed", label: "Risk reviewed" },
  { key: "dry_run_prepared", label: "Dry-run" }
];

export function AgentWorkflowStatus({ result, isRunning, error, stale }: { result: PerplAgentWorkflowResponse | null; isRunning: boolean; error: unknown; stale: boolean }) {
  const currentState = error ? "failed" : stale ? "stale" : isRunning ? "running" : result?.state ?? "pending";

  return (
    <Panel
      title="Agent workflow"
      description="Backend analysis progresses from data snapshot to deterministic risk review and dry-run plan."
      actions={<StatusBadge tone={stateTone(currentState)}>{currentState}</StatusBadge>}
      className="min-w-0"
    >
      <ol className="grid gap-2 sm:grid-cols-5" aria-live="polite">
        {steps.map((step) => {
          const state = statusFor(step.key, result, isRunning, error);
          const Icon = state === "complete" ? CheckCircle2 : state === "running" ? Loader2 : state === "failed" ? XCircle : Circle;
          return (
            <li key={step.key} className={`rounded-md border p-3 text-sm ${stateClass(state)}`}>
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${state === "running" ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
                <span className="font-medium">{step.label}</span>
              </div>
              <p className="mt-1 text-[11px] uppercase tracking-wide opacity-75">{state}</p>
            </li>
          );
        })}
      </ol>
      {result ? <p className="mt-3 text-xs text-terminal-muted">Returned state: <span className="font-mono font-semibold text-terminal-text">{result.state}</span></p> : null}
      {isRunning ? <p className="mt-3 text-xs text-terminal-muted">Waiting for the backend workflow response. No synthetic step output is shown.</p> : null}
    </Panel>
  );
}

function statusFor(step: string, result: PerplAgentWorkflowResponse | null, isRunning: boolean, error: unknown) {
  if (error) return "failed";
  if (isRunning) return step === "data_loaded" ? "running" : "pending";
  if (!result) return "pending";
  if (result.state === "clarification_required" && ["data_loaded", "analyzed", "strategy_generated"].includes(step)) return "complete";
  if (result.state === "rejected" && ["data_loaded", "analyzed", "strategy_generated", "risk_reviewed"].includes(step)) return "complete";
  if (result.state === "dry_run_prepared") return "complete";
  return ["data_loaded", "analyzed", "strategy_generated", "risk_reviewed"].includes(step) ? "complete" : "pending";
}

function stateClass(state: string) {
  if (state === "complete") return "border-signal-pass/30 bg-signal-pass/10 text-signal-pass";
  if (state === "running") return "border-signal-live/35 bg-signal-live/10 text-signal-live";
  if (state === "failed") return "border-signal-danger/35 bg-signal-danger/10 text-signal-danger";
  return "border-terminal-line bg-terminal-raised/35 text-terminal-muted";
}

function stateTone(state: string) {
  if (state === "running") return "live";
  if (state === "dry_run_prepared") return "success";
  if (state === "failed" || state === "rejected") return "danger";
  if (state === "stale" || state === "clarification_required") return "warning";
  return "neutral";
}
